import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db, transaction, Tx } from "./db";
import { Actor, authorize, DomainError, hash, internal, scope } from "./auth";
import { calculateLine, D, money, totals } from "./money";
const buyers = ["GROUP_ADMIN", "ENTITY_ADMIN", "BUYER"];
const approvers = ["GROUP_ADMIN", "ENTITY_ADMIN", "APPROVER"];
const warehouseRoles = ["GROUP_ADMIN", "ENTITY_ADMIN", "WAREHOUSE"];
const financeRoles = ["GROUP_ADMIN", "ENTITY_ADMIN", "FINANCE"];
const id = z.string().min(1).max(100);
const decimal = z
  .union([z.string(), z.number()])
  .refine((v) => {
    try {
      const n = D(v);
      return (
        n.isFinite() &&
        n.gte(0) &&
        n.lt("1000000000000") &&
        n.decimalPlaces() <= 6
      );
    } catch {
      return false;
    }
  }, "Enter a non-negative amount with up to 6 decimal places")
  .transform((v) => D(v).toString());
const positive = decimal.refine((v) => D(v).gt(0), "Quantity must be positive");
const percent = decimal.refine(
  (v) => D(v).lte(100),
  "Percentage must be 0–100",
);
const date = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const text = z.string().trim().min(1).max(4000);
function ensure(value: unknown, message: string, status = 400): asserts value {
  if (!value) throw new DomainError(message, status);
}
async function audit(
  tx: Tx,
  a: Actor,
  entityId: string | null,
  action: string,
  type: string,
  targetId: string,
  reason: string,
  before?: unknown,
  after?: unknown,
) {
  const clean = (v: unknown) =>
    v === undefined
      ? undefined
      : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);
  await tx.audit.create({
    data: {
      tenantId: a.tenantId,
      entityId,
      actorId: a.id,
      action,
      targetType: type,
      targetId,
      reason,
      before: clean(before),
      after: clean(after),
    },
  });
}
async function entity(tx: Tx, a: Actor, entityId: string) {
  authorize(
    a,
    [
      "GROUP_ADMIN",
      "ENTITY_ADMIN",
      "BUYER",
      "REQUESTER",
      "APPROVER",
      "WAREHOUSE",
      "FINANCE",
      "AUDITOR",
    ],
    entityId,
  );
  const e = await tx.entity.findFirst({
    where: { id: entityId, tenantId: a.tenantId },
  });
  ensure(e, "Entity not found", 404);
  return e;
}
async function products(tx: Tx, a: Actor, ids: string[]) {
  const count = await tx.product.count({
    where: { tenantId: a.tenantId, id: { in: [...new Set(ids)] } },
  });
  ensure(count === new Set(ids).size, "Product not found in your tenant", 404);
}
async function budgetCheck(
  tx: Tx,
  a: Actor,
  budgetId: string | null,
  entityId: string,
  amount: string,
) {
  if (!budgetId) return;
  const b = await tx.budget.findFirst({
    where: { id: budgetId, tenantId: a.tenantId, entityId },
  });
  ensure(b, "Budget not found", 404);
  const e = await tx.entity.findUniqueOrThrow({ where: { id: entityId } });
  const policy = e.policy as Record<string, unknown>;
  ensure(
    policy.allowOverBudget === true ||
      D(b.allocated).minus(b.committed).minus(b.actual).gte(amount),
    "Budget limit exceeded",
  );
}
const ref = (prefix: string) =>
  prefix +
  "-" +
  new Date().getUTCFullYear() +
  "-" +
  randomBytes(5).toString("hex").toUpperCase();
async function approval(
  tx: Tx,
  a: Actor,
  entityId: string,
  targetType: string,
  targetId: string,
  version: number,
) {
  const e = await tx.entity.findUniqueOrThrow({ where: { id: entityId } });
  return tx.approval.create({
    data: {
      tenantId: a.tenantId,
      entityId,
      targetType,
      targetId,
      targetVersion: version,
      requesterId: a.id,
      policySnapshot: e.policy as Prisma.InputJsonValue,
    },
  });
}
export async function stock(
  tx: Tx,
  a: Actor,
  entityId: string,
  warehouseId: string,
  productId: string,
) {
  const s = await tx.stockMovement.aggregate({
    where: { tenantId: a.tenantId, entityId, warehouseId, productId },
    _sum: { quantity: true, reservedDelta: true, quarantineDelta: true },
  });
  const onHand = D(s._sum.quantity ?? 0),
    reserved = D(s._sum.reservedDelta ?? 0),
    quarantine = D(s._sum.quarantineDelta ?? 0);
  return {
    onHand: money(onHand),
    reserved: money(reserved),
    quarantine: money(quarantine),
    available: money(onHand.minus(reserved)),
  };
}
export async function createRequisition(a: Actor, input: unknown) {
  internal(a);
  const p = z
    .object({
      entityId: id,
      departmentId: id,
      warehouseId: id,
      budgetId: id.optional(),
      justification: text,
      requiredAt: date,
      emergency: z.boolean().default(false),
      singleSource: z.boolean().default(false),
      lines: z
        .array(
          z.object({
            productId: id,
            quantity: positive,
            estimatedUnitPrice: decimal,
            specifications: z.string().max(4000).default(""),
          }),
        )
        .min(1)
        .max(100),
    })
    .parse(input);
  authorize(a, [...buyers, "REQUESTER"], p.entityId);
  return transaction(async (tx) => {
    await entity(tx, a, p.entityId);
    await products(
      tx,
      a,
      p.lines.map((l) => l.productId),
    );
    ensure(
      await tx.department.count({
        where: {
          id: p.departmentId,
          tenantId: a.tenantId,
          entityId: p.entityId,
        },
      }),
      "Invalid department",
    );
    ensure(
      await tx.warehouse.count({
        where: {
          id: p.warehouseId,
          tenantId: a.tenantId,
          entityId: p.entityId,
        },
      }),
      "Invalid warehouse",
    );
    if (p.budgetId) {
      const b = await tx.budget.findFirst({
        where: {
          id: p.budgetId,
          tenantId: a.tenantId,
          entityId: p.entityId,
          departmentId: p.departmentId,
        },
      });
      ensure(b, "Budget does not belong to selected department");
    }
    const r = await tx.requisition.create({
      data: {
        ...p,
        tenantId: a.tenantId,
        requesterId: a.id,
        reference: ref("REQ"),
        lines: { create: p.lines },
      },
      include: { lines: true },
    });
    await audit(
      tx,
      a,
      p.entityId,
      "CREATE",
      "Requisition",
      r.id,
      p.justification,
      undefined,
      r,
    );
    return r;
  });
}
export async function submitRequisition(a: Actor, requisitionId: string) {
  internal(a);
  return transaction(async (tx) => {
    const r = await tx.requisition.findFirst({
      where: { id: requisitionId, ...scope(a) },
      include: { lines: true },
    });
    ensure(r, "Requisition not found", 404);
    authorize(a, [...buyers, "REQUESTER"], r.entityId);
    ensure(
      r.requesterId === a.id || buyers.includes(a.role),
      "Only owner or buyer can submit",
      403,
    );
    ensure(
      ["DRAFT", "RETURNED"].includes(r.status),
      "Requisition is not editable",
    );
    const cost = r.lines.reduce(
      (n, l) => n.plus(D(l.quantity).times(l.estimatedUnitPrice)),
      D(0),
    );
    await budgetCheck(tx, a, r.budgetId, r.entityId, money(cost));
    await tx.requisition.update({
      where: { id: r.id },
      data: { status: "SUBMITTED" },
    });
    await approval(tx, a, r.entityId, "REQUISITION", r.id, r.version);
    const availability = await Promise.all(
      r.lines.map(async (l) => ({
        productId: l.productId,
        ...(await stock(tx, a, r.entityId, r.warehouseId, l.productId)),
      })),
    );
    await audit(
      tx,
      a,
      r.entityId,
      "SUBMIT",
      "Requisition",
      r.id,
      "Requested approval; stock checked",
      r,
      { status: "SUBMITTED", availability },
    );
    return { id: r.id, availability };
  });
}
export async function reviseRequisition(
  a: Actor,
  requisitionId: string,
  input: unknown,
) {
  const p = z
    .object({
      justification: text,
      lines: z
        .array(
          z.object({
            productId: id,
            quantity: positive,
            estimatedUnitPrice: decimal,
            specifications: z.string().default(""),
          }),
        )
        .min(1)
        .max(100),
    })
    .parse(input);
  internal(a);
  return transaction(async (tx) => {
    const r = await tx.requisition.findFirst({
      where: { id: requisitionId, ...scope(a) },
    });
    ensure(r, "Requisition not found", 404);
    authorize(a, [...buyers, "REQUESTER"], r.entityId);
    ensure(
      r.requesterId === a.id || buyers.includes(a.role),
      "Not the requester",
      403,
    );
    ensure(
      !(await tx.rfq.count({ where: { requisitionId: r.id } })),
      "Already sourced: use a new requisition",
    );
    ensure(
      ["DRAFT", "RETURNED", "APPROVED", "SUBMITTED"].includes(r.status),
      "Cannot revise this requisition",
    );
    await products(
      tx,
      a,
      p.lines.map((l) => l.productId),
    );
    await tx.approval.updateMany({
      where: { targetType: "REQUISITION", targetId: r.id, status: "PENDING" },
      data: { status: "SUPERSEDED" },
    });
    await tx.requisitionLine.deleteMany({ where: { requisitionId: r.id } });
    const result = await tx.requisition.update({
      where: { id: r.id },
      data: {
        justification: p.justification,
        version: { increment: 1 },
        status: "DRAFT",
        lines: { create: p.lines },
      },
    });
    await audit(
      tx,
      a,
      r.entityId,
      "REVISE",
      "Requisition",
      r.id,
      "Material change requires reapproval",
      r,
      result,
    );
    return result;
  });
}
export async function decideApproval(
  a: Actor,
  approvalId: string,
  input: unknown,
) {
  internal(a);
  const p = z
    .object({
      decision: z.enum(["APPROVED", "REJECTED", "RETURNED"]),
      reason: text,
    })
    .parse(input);
  return transaction(async (tx) => {
    const ap = await tx.approval.findFirst({
      where: { id: approvalId, ...scope(a) },
    });
    ensure(ap, "Approval not found", 404);
    authorize(a, approvers, ap.entityId);
    ensure(ap.requesterId !== a.id, "Self-approval is prohibited", 403);
    ensure(ap.status === "PENDING", "Approval already decided");
    if (ap.targetType === "REQUISITION") {
      const r = await tx.requisition.findFirst({
        where: { id: ap.targetId, tenantId: a.tenantId, entityId: ap.entityId },
        include: { lines: true },
      });
      ensure(
        r && r.version === ap.targetVersion && r.status === "SUBMITTED",
        "Transaction version changed",
      );
      if (p.decision === "APPROVED")
        await budgetCheck(
          tx,
          a,
          r.budgetId,
          r.entityId,
          money(
            r.lines.reduce(
              (n, l) => n.plus(D(l.quantity).times(l.estimatedUnitPrice)),
              D(0),
            ),
          ),
        );
      await tx.requisition.update({
        where: { id: r.id },
        data: { status: p.decision },
      });
    } else if (ap.targetType === "AWARD") {
      const aw = await tx.award.findFirst({
        where: { id: ap.targetId, tenantId: a.tenantId, entityId: ap.entityId },
        include: { lines: true },
      });
      ensure(
        aw && aw.status === "PENDING" && aw.version === ap.targetVersion,
        "Award version changed",
      );
      ensure(
        p.decision !== "RETURNED",
        "Reject and submit a replacement award",
      );
      if (p.decision === "APPROVED") await issueOrders(tx, a, aw);
      await tx.award.update({
        where: { id: aw.id },
        data: { status: p.decision },
      });
    } else throw new DomainError("Unknown approval target");
    const result = await tx.approval.update({
      where: { id: ap.id },
      data: {
        status: p.decision,
        decidedBy: a.id,
        reason: p.reason,
        decidedAt: new Date(),
      },
    });
    await audit(
      tx,
      a,
      ap.entityId,
      "DECIDE_APPROVAL",
      ap.targetType,
      ap.targetId,
      p.reason,
      ap,
      result,
    );
    return result;
  });
}
export async function createRfq(a: Actor, input: unknown) {
  internal(a);
  const p = z
    .object({
      requisitionId: id,
      title: text,
      deadline: date,
      sealed: z.boolean().default(true),
    })
    .parse(input);
  ensure(p.deadline > new Date(), "Deadline must be in the future");
  return transaction(async (tx) => {
    const r = await tx.requisition.findFirst({
      where: { id: p.requisitionId, ...scope(a) },
      include: { lines: true },
    });
    ensure(r, "Requisition not found", 404);
    authorize(a, buyers, r.entityId);
    ensure(r.status === "APPROVED", "Requisition must be approved");
    ensure(
      !(await tx.rfq.count({ where: { requisitionId: r.id } })),
      "Requisition already has an RFQ",
    );
    const ps = await tx.product.findMany({
      where: {
        id: { in: r.lines.map((l) => l.productId) },
        tenantId: a.tenantId,
      },
    });
    const rfq = await tx.rfq.create({
      data: {
        tenantId: a.tenantId,
        entityId: r.entityId,
        creatorId: a.id,
        requisitionId: r.id,
        warehouseId: r.warehouseId,
        budgetId: r.budgetId,
        reference: ref("RFQ"),
        title: p.title,
        deadline: p.deadline,
        sealed: p.sealed,
        lines: {
          create: r.lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unit: ps.find((x) => x.id === l.productId)!.baseUnit,
            specifications: l.specifications,
          })),
        },
      },
      include: { lines: true },
    });
    await audit(
      tx,
      a,
      r.entityId,
      "CREATE",
      "Rfq",
      rfq.id,
      "Created from approved requisition",
      undefined,
      rfq,
    );
    return rfq;
  });
}
export async function inviteRfq(a: Actor, rfqId: string, input: unknown) {
  internal(a);
  const p = z.object({ vendorIds: z.array(id).min(1).max(100) }).parse(input);
  return transaction(async (tx) => {
    const r = await tx.rfq.findFirst({ where: { id: rfqId, ...scope(a) } });
    ensure(r, "RFQ not found", 404);
    authorize(a, buyers, r.entityId);
    ensure(
      ["DRAFT", "OPEN"].includes(r.status) && r.deadline > new Date(),
      "RFQ is closed",
    );
    const e = await tx.entity.findUniqueOrThrow({ where: { id: r.entityId } });
    const vs = await tx.vendor.findMany({
      where: {
        tenantId: a.tenantId,
        id: { in: p.vendorIds },
        status: "APPROVED",
        countries: { has: e.country },
      },
    });
    ensure(
      vs.length === new Set(p.vendorIds).size,
      "Only approved vendors serving entity country may be invited",
    );
    for (const v of vs) {
      const prior = await tx.rfqVendor.findUnique({
        where: { rfqId_vendorId: { rfqId: r.id, vendorId: v.id } },
      });
      if (prior) continue;
      await tx.rfqVendor.create({
        data: {
          rfqId: r.id,
          vendorId: v.id,
          tenantId: a.tenantId,
          acknowledgedVersion: r.version,
        },
      });
      await tx.job.create({
        data: {
          tenantId: a.tenantId,
          entityId: r.entityId,
          type: "RFQ_INVITATION",
          payload: {
            email: v.email,
            rfqId: r.id,
            reference: r.reference,
            title: r.title,
            deadline: r.deadline.toISOString(),
          },
        },
      });
    }
    await tx.rfq.update({ where: { id: r.id }, data: { status: "OPEN" } });
    await audit(
      tx,
      a,
      r.entityId,
      "INVITE",
      "Rfq",
      r.id,
      "Invitations queued for delivery",
      undefined,
      { vendorIds: p.vendorIds },
    );
    return { queued: vs.length };
  });
}
export async function amendRfq(a: Actor, rfqId: string, input: unknown) {
  internal(a);
  const p = z
    .object({ deadline: date, terms: text, reason: text })
    .parse(input);
  return transaction(async (tx) => {
    const r = await tx.rfq.findFirst({
      where: { id: rfqId, ...scope(a) },
      include: { vendors: true },
    });
    ensure(r, "RFQ not found", 404);
    authorize(a, buyers, r.entityId);
    ensure(
      ["DRAFT", "OPEN"].includes(r.status) && !r.openedAt,
      "RFQ cannot be amended after bid opening",
    );
    ensure(p.deadline > new Date(), "New deadline must be in the future");
    const result = await tx.rfq.update({
      where: { id: r.id },
      data: { deadline: p.deadline, terms: p.terms, version: { increment: 1 } },
    });
    for (const rv of r.vendors) {
      const v = await tx.vendor.findUniqueOrThrow({
        where: { id: rv.vendorId },
      });
      await tx.job.create({
        data: {
          tenantId: a.tenantId,
          entityId: r.entityId,
          type: "RFQ_AMENDMENT",
          payload: {
            email: v.email,
            rfqId: r.id,
            reference: r.reference,
            version: result.version,
            reason: p.reason,
          },
        },
      });
    }
    await audit(tx, a, r.entityId, "AMEND", "Rfq", r.id, p.reason, r, result);
    return result;
  });
}
export async function acknowledgeRfq(a: Actor, rfqId: string) {
  ensure(a.vendorId, "Vendor account required", 403);
  return transaction(async (tx) => {
    const rv = await tx.rfqVendor.findFirst({
      where: { rfqId, vendorId: a.vendorId!, tenantId: a.tenantId },
      include: { rfq: true },
    });
    ensure(rv, "Invitation not found", 404);
    const result = await tx.rfqVendor.update({
      where: { rfqId_vendorId: { rfqId, vendorId: a.vendorId! } },
      data: { acknowledgedVersion: rv.rfq.version },
    });
    await audit(
      tx,
      a,
      rv.rfq.entityId,
      "ACKNOWLEDGE",
      "Rfq",
      rfqId,
      "Vendor acknowledged amendment",
    );
    return result;
  });
}
export async function submitQuote(a: Actor, rfqId: string, input: unknown) {
  const p = z
    .object({
      vendorId: id.optional(),
      currency: z.string().regex(/^[A-Z]{3}$/),
      fxRate: positive,
      fxSource: text,
      fxAt: date,
      freight: decimal,
      otherCharges: decimal,
      paymentTerms: text,
      validUntil: date,
      leadDays: z.number().int().min(0).max(3650),
      source: z.enum(["PORTAL", "EMAIL", "MANUAL"]).default("PORTAL"),
      lines: z
        .array(
          z.object({
            rfqLineId: id,
            offeredQuantity: positive,
            packFactor: positive,
            unitPrice: decimal,
            discountPercent: percent.default("0"),
            taxPercent: percent.default("0"),
            taxRecoverable: z.boolean().default(false),
            moq: positive.default("1"),
            compliant: z.boolean().default(true),
            deviation: z.string().max(4000).default(""),
          }),
        )
        .min(1)
        .max(100),
    })
    .parse(input);
  return transaction(async (tx) => {
    const r = await tx.rfq.findFirst({
      where: { id: rfqId, tenantId: a.tenantId },
      include: { lines: true },
    });
    ensure(r, "RFQ not found", 404);
    let vendorId: string;
    if (a.vendorId) {
      authorize(a, ["VENDOR_ADMIN", "VENDOR_EMPLOYEE"]);
      vendorId = a.vendorId;
      ensure(p.source === "PORTAL", "Vendor source must be portal");
    } else {
      authorize(a, buyers, r.entityId);
      ensure(p.vendorId, "Select vendor");
      vendorId = p.vendorId;
      ensure(
        p.source !== "PORTAL",
        "Internal offers must record their external source",
      );
    }
    const invitation = await tx.rfqVendor.findFirst({
      where: { rfqId: r.id, vendorId, tenantId: a.tenantId },
    });
    ensure(invitation, "Vendor was not invited", 403);
    const vendor = await tx.vendor.findFirst({
      where: { id: vendorId, tenantId: a.tenantId, status: "APPROVED" },
    });
    ensure(vendor, "Vendor must be approved");
    ensure(r.status === "OPEN" && !r.openedAt, "RFQ is not accepting offers");
    ensure(r.deadline > new Date(), "Late offers are rejected");
    ensure(p.validUntil > new Date(), "Quotation has expired");
    ensure(
      invitation.acknowledgedVersion === r.version,
      "Acknowledge current RFQ amendment before submitting",
    );
    const ent = await tx.entity.findUniqueOrThrow({
      where: { id: r.entityId },
    });
    if (a.vendorId)
      ensure(
        p.currency === ent.currency && D(p.fxRate).eq(1),
        "Portal offers currently require entity currency; foreign-currency offers need buyer-verified exchange rates",
      );
    if (p.currency === ent.currency)
      ensure(D(p.fxRate).eq(1), "Base currency rate must be 1");
    const taxPolicy = ent.policy as Record<string, unknown>;
    if (p.lines.some((l) => l.taxRecoverable))
      ensure(
        !a.vendorId && taxPolicy.recoverableTax === true,
        "Only buyers can apply verified tax recovery rules",
      );
    ensure(
      new Set(p.lines.map((l) => l.rfqLineId)).size === p.lines.length,
      "Duplicate quotation line",
    );
    ensure(
      p.lines.every((l) => r.lines.some((x) => x.id === l.rfqLineId)),
      "Line does not belong to this RFQ",
    );
    const existing = await tx.quote.aggregate({
      where: { rfqId: r.id, vendorId },
      _max: { version: true },
    });
    const q = await tx.quote.create({
      data: {
        tenantId: a.tenantId,
        entityId: r.entityId,
        rfqId: r.id,
        vendorId,
        version: (existing._max.version ?? 0) + 1,
        rfqVersion: r.version,
        currency: p.currency,
        fxRate: p.fxRate,
        fxSource: p.fxSource,
        fxAt: p.fxAt,
        freight: p.freight,
        otherCharges: p.otherCharges,
        paymentTerms: p.paymentTerms,
        validUntil: p.validUntil,
        leadDays: p.leadDays,
        source: p.source,
        lines: { create: p.lines },
      },
      include: { lines: true },
    });
    await tx.rfqVendor.update({
      where: { rfqId_vendorId: { rfqId: r.id, vendorId } },
      data: { status: "RESPONDED" },
    });
    await audit(
      tx,
      a,
      r.entityId,
      "SUBMIT_SNAPSHOT",
      "Quote",
      q.id,
      "Immutable quotation version",
      undefined,
      q,
    );
    return q;
  });
}
export async function openRfq(a: Actor, rfqId: string) {
  internal(a);
  return transaction(async (tx) => {
    const r = await tx.rfq.findFirst({ where: { id: rfqId, ...scope(a) } });
    ensure(r, "RFQ not found", 404);
    authorize(a, buyers, r.entityId);
    ensure(r.status === "OPEN", "RFQ must be open");
    ensure(
      !r.sealed || r.deadline <= new Date(),
      "Sealed bids remain hidden until the deadline",
    );
    const result = await tx.rfq.update({
      where: { id: r.id },
      data: { status: "EVALUATION", openedAt: new Date() },
    });
    await audit(
      tx,
      a,
      r.entityId,
      "OPEN_BIDS",
      "Rfq",
      r.id,
      "Bidding closed and evaluation opened",
    );
    return result;
  });
}
async function comparisonTx(tx: Tx, a: Actor, rfqId: string) {
  internal(a);
  const r = await tx.rfq.findFirst({
    where: { id: rfqId, ...scope(a) },
    include: { lines: true },
  });
  ensure(r, "RFQ not found", 404);
  ensure(
    !r.sealed || !!r.openedAt,
    "Sealed offers are hidden until bid opening",
    403,
  );
  const raw = await tx.quote.findMany({
    where: { rfqId: r.id, tenantId: a.tenantId },
    include: { lines: true },
    orderBy: { version: "desc" },
  });
  const quotes = raw.filter(
    (q, i) => raw.findIndex((x) => x.vendorId === q.vendorId) === i,
  );
  const weights = r.weights as {
    price: number;
    lead: number;
    performance: number;
  };
  ensure(
    weights.price + weights.lead + weights.performance === 100,
    "Evaluation weights must total 100",
  );
  const results = await Promise.all(
    quotes.map(async (q) => {
      const vendor = await tx.vendor.findFirstOrThrow({
        where: { id: q.vendorId, tenantId: a.tenantId },
      });
      const calculations = q.lines.map((l) => {
        const requested = r.lines.find((x) => x.id === l.rfqLineId)!;
        const calc = calculateLine(l, requested.quantity);
        return {
          rfqLineId: l.rfqLineId,
          productId: requested.productId,
          quoteLineId: l.id,
          requestedQuantity: money(requested.quantity),
          baseUnitPrice: money(calc.baseUnitPrice),
          net: money(calc.net),
          tax: money(calc.tax),
          payable: money(calc.payable),
          evaluation: money(calc.evaluation.times(q.fxRate)),
          eligible: calc.eligible,
          packFactor: money(l.packFactor),
          offeredQuantity: money(l.offeredQuantity),
          moq: money(l.moq),
          deviation: l.deviation,
        };
      });
      const total = totals(
        q.lines.map((l) => ({
          line: l,
          quantity: r.lines.find((x) => x.id === l.rfqLineId)!.quantity,
        })),
        q.freight,
        q.otherCharges,
        q.fxRate,
      );
      const reasons = [] as string[];
      if (q.lines.length !== r.lines.length) reasons.push("Missing lines");
      if (!total.eligible)
        reasons.push("Noncompliance, capacity, MOQ or indivisible packs");
      if (q.validUntil < new Date()) reasons.push("Expired quotation");
      if (q.rfqVersion !== r.version) reasons.push("Superseded RFQ version");
      if (vendor.status !== "APPROVED") reasons.push("Vendor not approved");
      return {
        id: q.id,
        vendorId: q.vendorId,
        vendor: vendor.name,
        version: q.version,
        currency: q.currency,
        fxRate: q.fxRate.toString(),
        fxSource: q.fxSource,
        fxAt: q.fxAt,
        leadDays: q.leadDays,
        paymentTerms: q.paymentTerms,
        validUntil: q.validUntil,
        freight: money(q.freight),
        otherCharges: money(q.otherCharges),
        payable: money(total.payable),
        evaluation: money(total.evaluation),
        eligible: reasons.length === 0,
        reasons,
        performance: vendor.score.toNumber(),
        lines: calculations,
        score: 0,
      };
    }),
  );
  const eligible = results.filter((q) => q.eligible);
  const lowest = eligible.length
    ? DecimalMin(eligible.map((q) => q.evaluation))
    : D(0);
  const fastest = eligible.length
    ? Math.min(...eligible.map((q) => q.leadDays))
    : 0;
  for (const q of results)
    if (q.eligible) {
      const priceScore = D(q.evaluation).eq(0)
        ? 100
        : lowest.div(q.evaluation).times(100).toNumber();
      const leadScore =
        q.leadDays === 0
          ? 100
          : fastest === 0
            ? 0
            : (fastest / q.leadDays) * 100;
      q.score = Number(
        (
          (priceScore * weights.price +
            leadScore * weights.lead +
            q.performance * weights.performance) /
          100
        ).toFixed(2),
      );
    }
  return {
    rfq: r,
    offers: results.sort((a, b) => b.score - a.score),
    formulas: {
      net: "requested base quantity / offered pack factor × pack price × (1 − discount% / 100)",
      payable: "net + all tax + explicit freight + other charges",
      evaluation:
        "(net + nonrecoverable tax + freight + other charges) × snapshotted FX rate",
      priceScore:
        "lowest eligible evaluation cost / offer evaluation cost × 100",
      leadScore:
        "fastest eligible lead time / offer lead time × 100; zero-day handling documented",
      weighted:
        "price × 60% + lead × 20% + verified supplier performance × 20%; configured per RFQ",
    },
  };
}
function DecimalMin(v: string[]) {
  return v.reduce((n, x) => (D(x).lt(n) ? D(x) : n), D(v[0]));
}
export async function comparison(a: Actor, rfqId: string) {
  return transaction((tx) => comparisonTx(tx, a, rfqId));
}
export async function proposeAward(a: Actor, rfqId: string, input: unknown) {
  internal(a);
  const p = z
    .object({
      reason: text,
      lines: z
        .array(z.object({ quoteLineId: id, quantity: positive }))
        .min(1)
        .max(100),
    })
    .parse(input);
  return transaction(async (tx) => {
    const r = await tx.rfq.findFirst({
      where: { id: rfqId, ...scope(a) },
      include: { lines: true },
    });
    ensure(r, "RFQ not found", 404);
    authorize(a, buyers, r.entityId);
    ensure(r.status === "EVALUATION", "RFQ must be in evaluation");
    const previous = await tx.award.findUnique({ where: { rfqId } });
    ensure(
      !previous || previous.status === "REJECTED",
      "An award already exists",
    );
    if (previous) {
      await tx.awardLine.deleteMany({ where: { awardId: previous.id } });
      await tx.award.delete({ where: { id: previous.id } });
    }
    ensure(
      new Set(p.lines.map((l) => l.quoteLineId)).size === p.lines.length,
      "Duplicate allocation",
    );
    const quantities = new Map<string, ReturnType<typeof D>>();
    for (const l of p.lines) {
      const ql = await tx.quoteLine.findUnique({
        where: { id: l.quoteLineId },
        include: { quote: true },
      });
      ensure(
        ql && ql.quote.tenantId === a.tenantId && ql.quote.rfqId === r.id,
        "Quote line not found",
        404,
      );
      const latest = await tx.quote.findFirst({
        where: { rfqId: r.id, vendorId: ql.quote.vendorId },
        orderBy: { version: "desc" },
      });
      ensure(latest?.id === ql.quoteId, "Use latest quotation version");
      ensure(
        ql.quote.validUntil > new Date() && ql.quote.rfqVersion === r.version,
        "Expired or superseded offer",
      );
      const v = await tx.vendor.findFirst({
        where: {
          id: ql.quote.vendorId,
          tenantId: a.tenantId,
          status: "APPROVED",
        },
      });
      ensure(v, "Supplier is no longer approved");
      ensure(
        calculateLine(ql, l.quantity).eligible,
        "Award exceeds availability, violates MOQ, pack conversion or technical compliance",
      );
      quantities.set(
        ql.rfqLineId,
        (quantities.get(ql.rfqLineId) ?? D(0)).plus(l.quantity),
      );
    }
    ensure(
      r.lines.every((l) => quantities.get(l.id)?.eq(l.quantity)),
      "Allocate exactly the requested quantity on every RFQ line",
    );
    const snapshot = await comparisonTx(tx, a, rfqId);
    const aw = await tx.award.create({
      data: {
        tenantId: a.tenantId,
        entityId: r.entityId,
        rfqId: r.id,
        requesterId: a.id,
        reason: p.reason,
        evaluationSnapshot: JSON.parse(JSON.stringify(snapshot)),
        lines: { create: p.lines },
      },
      include: { lines: true },
    });
    await approval(tx, a, r.entityId, "AWARD", aw.id, aw.version);
    await audit(
      tx,
      a,
      r.entityId,
      "PROPOSE",
      "Award",
      aw.id,
      p.reason,
      undefined,
      aw,
    );
    return aw;
  });
}
async function issueOrders(
  tx: Tx,
  a: Actor,
  aw: {
    id: string;
    entityId: string;
    rfqId: string;
    lines: { quoteLineId: string; quantity: Prisma.Decimal }[];
  },
) {
  const r = await tx.rfq.findFirstOrThrow({
    where: { id: aw.rfqId, tenantId: a.tenantId },
    include: { lines: true },
  });
  const ent = await entity(tx, a, aw.entityId);
  const grouped = new Map<
    string,
    {
      quote: Prisma.QuoteGetPayload<{ include: { lines: true } }>;
      lines: {
        ql: Prisma.QuoteLineGetPayload<object>;
        quantity: Prisma.Decimal;
      }[];
    }
  >();
  for (const l of aw.lines) {
    const ql = await tx.quoteLine.findUniqueOrThrow({
      where: { id: l.quoteLineId },
      include: { quote: { include: { lines: true } } },
    });
    ensure(
      ql.quote.tenantId === a.tenantId &&
        ql.quote.rfqId === r.id &&
        ql.quote.validUntil > new Date() &&
        ql.quote.rfqVersion === r.version,
      "Offer no longer eligible for approval",
    );
    const vendor = await tx.vendor.findFirst({
      where: {
        id: ql.quote.vendorId,
        tenantId: a.tenantId,
        status: "APPROVED",
      },
    });
    ensure(vendor, "Supplier is no longer approved");
    ensure(calculateLine(ql, l.quantity).eligible, "Allocation invalid");
    const g = grouped.get(ql.quote.vendorId) ?? { quote: ql.quote, lines: [] };
    g.lines.push({ ql, quantity: l.quantity });
    grouped.set(ql.quote.vendorId, g);
  }
  const amounts = [...grouped.values()].map((g) =>
    totals(
      g.lines.map((l) => ({ line: l.ql, quantity: l.quantity })),
      g.quote.freight,
      g.quote.otherCharges,
      g.quote.fxRate,
    ).payable.times(g.quote.fxRate),
  );
  const total = amounts.reduce((n, x) => n.plus(x), D(0));
  await budgetCheck(tx, a, r.budgetId, r.entityId, money(total));
  for (const [vendorId, g] of grouped) {
    const t = totals(
      g.lines.map((l) => ({ line: l.ql, quantity: l.quantity })),
      g.quote.freight,
      g.quote.otherCharges,
      g.quote.fxRate,
    );
    await tx.purchaseOrder.create({
      data: {
        tenantId: a.tenantId,
        entityId: r.entityId,
        reference: ref("PO"),
        vendorId,
        awardId: aw.id,
        warehouseId: r.warehouseId,
        budgetId: r.budgetId,
        currency: g.quote.currency,
        baseCurrency: ent.currency,
        fxRate: g.quote.fxRate,
        freight: g.quote.freight,
        otherCharges: g.quote.otherCharges,
        total: money(t.payable),
        baseTotal: money(t.payable.times(g.quote.fxRate)),
        dueAt: new Date(Date.now() + g.quote.leadDays * 86400000),
        paymentTerms: g.quote.paymentTerms,
        lines: {
          create: g.lines.map(({ ql, quantity }) => {
            const requested = r.lines.find((l) => l.id === ql.rfqLineId)!;
            return {
              productId: requested.productId,
              quoteLineId: ql.id,
              quantity,
              unit: requested.unit,
              packFactor: ql.packFactor,
              unitPrice: money(calculateLine(ql, quantity).baseUnitPrice),
              taxPercent: ql.taxPercent,
            };
          }),
        },
      },
    });
  }
  if (r.budgetId)
    await tx.budget.update({
      where: { id: r.budgetId },
      data: { committed: { increment: money(total) } },
    });
  await tx.rfq.update({ where: { id: r.id }, data: { status: "AWARDED" } });
  await audit(
    tx,
    a,
    r.entityId,
    "ISSUE_ORDERS",
    "Award",
    aw.id,
    "Approved award converted to POs; freight charged once per supplier",
    undefined,
    { baseCommitment: money(total) },
  );
}
export async function acknowledgeOrder(a: Actor, poId: string) {
  ensure(a.vendorId, "Vendor account required", 403);
  return transaction(async (tx) => {
    const po = await tx.purchaseOrder.findFirst({
      where: { id: poId, tenantId: a.tenantId, vendorId: a.vendorId! },
    });
    ensure(po, "Order not found", 404);
    ensure(po.status === "ISSUED", "Order already acknowledged");
    const result = await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { status: "ACKNOWLEDGED" },
    });
    await audit(
      tx,
      a,
      po.entityId,
      "ACKNOWLEDGE",
      "PurchaseOrder",
      po.id,
      "Vendor accepted order",
    );
    return result;
  });
}
export async function receive(
  a: Actor,
  poId: string,
  input: unknown,
  key: string,
) {
  internal(a);
  const p = z
    .object({
      lines: z
        .array(
          z.object({
            purchaseOrderLineId: id,
            accepted: decimal,
            rejected: decimal,
            reason: text,
          }),
        )
        .min(1)
        .max(100),
    })
    .parse(input);
  return transaction(async (tx) => {
    const po = await tx.purchaseOrder.findFirst({
      where: { id: poId, ...scope(a) },
      include: { lines: true },
    });
    ensure(po, "Order not found", 404);
    authorize(a, warehouseRoles, po.entityId);
    ensure(
      ["ISSUED", "ACKNOWLEDGED", "PARTIAL"].includes(po.status),
      "Order is not receivable",
    );
    ensure(
      new Set(p.lines.map((l) => l.purchaseOrderLineId)).size ===
        p.lines.length,
      "Duplicate receipt line",
    );
    const receipt = await tx.receipt.create({
      data: {
        tenantId: a.tenantId,
        entityId: po.entityId,
        purchaseOrderId: po.id,
        warehouseId: po.warehouseId,
        postedBy: a.id,
        idempotencyKey: key,
        lines: { create: p.lines },
      },
    });
    const orderNet = po.lines.reduce(
      (n, l) => n.plus(D(l.quantity).times(l.unitPrice)),
      D(0),
    );
    for (const l of p.lines) {
      const pl = po.lines.find((x) => x.id === l.purchaseOrderLineId);
      ensure(pl, "Receipt line does not belong to order");
      ensure(
        D(l.accepted).plus(l.rejected).gt(0),
        "Receipt must contain a quantity",
      );
      ensure(
        D(l.accepted).plus(l.rejected).lte(D(pl.quantity).minus(pl.received)),
        "Receipt exceeds outstanding quantity",
      );
      await tx.purchaseOrderLine.update({
        where: { id: pl.id },
        data: {
          received: { increment: l.accepted },
          rejected: { increment: l.rejected },
        },
      });
      const ql = await tx.quoteLine.findUniqueOrThrow({
        where: { id: pl.quoteLineId },
      });
      const allocatedCharges = orderNet.eq(0)
        ? D(po.freight)
            .plus(po.otherCharges)
            .div(po.lines.reduce((n, x) => n.plus(x.quantity), D(0)))
        : D(pl.unitPrice)
            .div(orderNet)
            .times(D(po.freight).plus(po.otherCharges));
      const unitCost = money(
        D(pl.unitPrice)
          .times(D(1).plus(ql.taxRecoverable ? 0 : D(pl.taxPercent).div(100)))
          .plus(allocatedCharges)
          .times(po.fxRate),
      );
      const item = await tx.product.findUniqueOrThrow({
        where: { id: pl.productId },
      });
      if (item.stockTracked && D(l.accepted).gt(0))
        await tx.stockMovement.create({
          data: {
            tenantId: a.tenantId,
            entityId: po.entityId,
            warehouseId: po.warehouseId,
            productId: pl.productId,
            type: "RECEIPT",
            quantity: l.accepted,
            unitCost,
            reference: receipt.id,
            actorId: a.id,
            reason: l.reason,
          },
        });
      if (item.stockTracked && D(l.rejected).gt(0))
        await tx.stockMovement.create({
          data: {
            tenantId: a.tenantId,
            entityId: po.entityId,
            warehouseId: po.warehouseId,
            productId: pl.productId,
            type: "QUARANTINE",
            quantity: 0,
            quarantineDelta: l.rejected,
            unitCost,
            reference: receipt.id,
            actorId: a.id,
            reason: l.reason,
          },
        });
    }
    const lines = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: po.id },
    });
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: lines.every((l) => D(l.received).eq(l.quantity))
          ? "RECEIVED"
          : "PARTIAL",
      },
    });
    await audit(
      tx,
      a,
      po.entityId,
      "POST_RECEIPT",
      "Receipt",
      receipt.id,
      "Accepted stock posted; rejected stock quarantined",
      undefined,
      p,
    );
    return receipt;
  });
}
export async function moveStock(a: Actor, input: unknown) {
  internal(a);
  const p = z
    .object({
      entityId: id,
      warehouseId: id,
      productId: id,
      type: z.enum([
        "ISSUE",
        "RESERVE",
        "RELEASE",
        "ADJUSTMENT",
        "QUARANTINE_RETURN",
      ]),
      quantity: positive,
      reason: text,
    })
    .parse(input);
  authorize(a, warehouseRoles, p.entityId);
  return transaction(async (tx) => {
    await entity(tx, a, p.entityId);
    await products(tx, a, [p.productId]);
    ensure(
      await tx.warehouse.count({
        where: {
          id: p.warehouseId,
          tenantId: a.tenantId,
          entityId: p.entityId,
        },
      }),
      "Warehouse not found",
    );
    const s = await stock(tx, a, p.entityId, p.warehouseId, p.productId);
    if (["ISSUE", "RESERVE"].includes(p.type))
      ensure(D(s.available).gte(p.quantity), "Insufficient available stock");
    if (p.type === "RELEASE")
      ensure(
        D(s.reserved).gte(p.quantity),
        "Cannot release more than reserved",
      );
    if (p.type === "QUARANTINE_RETURN")
      ensure(D(s.quarantine).gte(p.quantity), "Insufficient quarantined stock");
    if (p.type === "ADJUSTMENT")
      authorize(a, ["GROUP_ADMIN", "ENTITY_ADMIN"], p.entityId);
    const ledger = await tx.stockMovement.findMany({
      where: {
        tenantId: a.tenantId,
        entityId: p.entityId,
        warehouseId: p.warehouseId,
        productId: p.productId,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    let value = D(0),
      qty = D(0);
    for (const m of ledger) {
      value = value.plus(D(m.quantity).times(m.unitCost));
      qty = qty.plus(m.quantity);
    }
    const unitCost = qty.gt(0) ? money(value.div(qty)) : money(0);
    const movement = await tx.stockMovement.create({
      data: {
        tenantId: a.tenantId,
        entityId: p.entityId,
        warehouseId: p.warehouseId,
        productId: p.productId,
        type: p.type,
        quantity:
          p.type === "ISSUE"
            ? D(p.quantity).negated().toString()
            : p.type === "ADJUSTMENT"
              ? p.quantity
              : 0,
        reservedDelta:
          p.type === "RESERVE"
            ? p.quantity
            : p.type === "RELEASE"
              ? D(p.quantity).negated().toString()
              : 0,
        quarantineDelta:
          p.type === "QUARANTINE_RETURN"
            ? D(p.quantity).negated().toString()
            : 0,
        unitCost,
        reference: ref("STK"),
        actorId: a.id,
        reason: p.reason,
      },
    });
    await audit(
      tx,
      a,
      p.entityId,
      "POST_MOVEMENT",
      "StockMovement",
      movement.id,
      p.reason,
      undefined,
      movement,
    );
    return movement;
  });
}
export async function createInvoice(a: Actor, poId: string, input: unknown) {
  internal(a);
  const p = z
    .object({
      number: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .transform((v) => v.toUpperCase()),
      dueAt: date,
      freight: decimal,
      otherCharges: decimal,
      lines: z
        .array(
          z.object({
            purchaseOrderLineId: id,
            quantity: positive,
            unitPrice: decimal,
          }),
        )
        .min(1)
        .max(100),
    })
    .parse(input);
  return transaction(async (tx) => {
    const po = await tx.purchaseOrder.findFirst({
      where: { id: poId, ...scope(a) },
      include: { lines: true },
    });
    ensure(po, "Order not found", 404);
    authorize(a, financeRoles, po.entityId);
    ensure(
      new Set(p.lines.map((l) => l.purchaseOrderLineId)).size ===
        p.lines.length,
      "Duplicate invoice line",
    );
    const e = await tx.entity.findUniqueOrThrow({ where: { id: po.entityId } });
    const policy = e.policy as Record<string, unknown>;
    const tolerance = D(String(policy.priceTolerancePercent ?? 0));
    const issues: string[] = [];
    let total = D(p.freight).plus(p.otherCharges);
    const priorInvoices = await tx.invoice.findMany({
      where: {
        purchaseOrderId: po.id,
        status: { in: ["MATCHED", "PAID", "PARTIALLY_PAID"] },
      },
      include: { lines: true },
    });
    let priorFreight = D(0),
      priorOther = D(0);
    for (const inv of priorInvoices) {
      const snap = inv.matchSnapshot as Record<string, unknown>;
      priorFreight = priorFreight.plus(String(snap.freight ?? 0));
      priorOther = priorOther.plus(String(snap.otherCharges ?? 0));
    }
    if (D(p.freight).plus(priorFreight).gt(po.freight))
      issues.push("Freight exceeds order balance");
    if (D(p.otherCharges).plus(priorOther).gt(po.otherCharges))
      issues.push("Other charges exceed order balance");
    for (const l of p.lines) {
      const pl = po.lines.find((x) => x.id === l.purchaseOrderLineId);
      ensure(pl, "Invoice line does not belong to order");
      const product = await tx.product.findUniqueOrThrow({
        where: { id: pl.productId },
      });
      const invoiced = priorInvoices
        .flatMap((i) => i.lines)
        .filter((x) => x.purchaseOrderLineId === pl.id)
        .reduce((n, x) => n.plus(x.quantity), D(0));
      const matchQty =
        product.kind === "SERVICE" ? D(pl.quantity) : D(pl.received);
      if (D(l.quantity).plus(invoiced).gt(matchQty))
        issues.push(
          "Quantity exceeds " +
            (product.kind === "SERVICE" ? "ordered" : "accepted receipt") +
            " balance for " +
            product.sku,
        );
      const delta = D(l.unitPrice).minus(pl.unitPrice).abs();
      const allowed = D(pl.unitPrice).times(tolerance).div(100);
      if (delta.gt(allowed))
        issues.push("Price tolerance exceeded for " + product.sku);
      total = total.plus(
        D(l.quantity)
          .times(l.unitPrice)
          .times(D(1).plus(D(pl.taxPercent).div(100))),
      );
    }
    const baseAmount = total.times(po.fxRate);
    const used = priorInvoices.reduce(
      (n, i) => n.plus(D(i.total).times(po.fxRate)),
      D(0),
    );
    if (used.plus(baseAmount).gt(po.baseTotal))
      issues.push("Cumulative invoices exceed approved order value");
    const inv = await tx.invoice.create({
      data: {
        tenantId: a.tenantId,
        entityId: po.entityId,
        vendorId: po.vendorId,
        purchaseOrderId: po.id,
        number: p.number,
        currency: po.currency,
        total: money(total),
        dueAt: p.dueAt,
        status: issues.length ? "EXCEPTION" : "MATCHED",
        exceptions: issues,
        matchSnapshot: {
          freight: p.freight,
          otherCharges: p.otherCharges,
          policy: e.policy,
          poVersion: po.version,
          matchedAt: new Date().toISOString(),
          method: "Goods: three-way; services: two-way",
        },
        createdBy: a.id,
        lines: { create: p.lines },
      },
      include: { lines: true },
    });
    if (!issues.length && po.budgetId)
      await tx.budget.update({
        where: { id: po.budgetId },
        data: {
          committed: { decrement: money(baseAmount) },
          actual: { increment: money(baseAmount) },
        },
      });
    await audit(
      tx,
      a,
      po.entityId,
      "MATCH_INVOICE",
      "Invoice",
      inv.id,
      issues.length
        ? "Invoice held for exceptions"
        : "Invoice matched; expenditure recognized",
      undefined,
      inv,
    );
    return inv;
  });
}
export async function recordPayment(
  a: Actor,
  invoiceId: string,
  input: unknown,
) {
  internal(a);
  const p = z
    .object({
      amount: positive,
      reference: text,
      source: z.enum(["MANUAL_BANK_CONFIRMATION", "ERP"]),
      paidAt: date,
    })
    .parse(input);
  return transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({
      where: { id: invoiceId, ...scope(a) },
      include: { payments: true },
    });
    ensure(inv, "Invoice not found", 404);
    authorize(a, financeRoles, inv.entityId);
    ensure(
      ["MATCHED", "PARTIALLY_PAID"].includes(inv.status),
      "Only matched invoices can receive payments",
    );
    ensure(p.source !== "ERP", "ERP payment adapter is not configured");
    ensure(p.paidAt <= new Date(), "Payment date cannot be in the future");
    const paid = inv.payments
      .reduce((n, x) => n.plus(x.amount), D(0))
      .plus(p.amount);
    ensure(paid.lte(inv.total), "Payment exceeds unpaid amount");
    const payment = await tx.payment.create({
      data: {
        ...p,
        tenantId: a.tenantId,
        entityId: inv.entityId,
        invoiceId: inv.id,
        recordedBy: a.id,
      },
    });
    await tx.invoice.update({
      where: { id: inv.id },
      data: { status: paid.eq(inv.total) ? "PAID" : "PARTIALLY_PAID" },
    });
    await audit(
      tx,
      a,
      inv.entityId,
      "RECORD_PAYMENT",
      "Invoice",
      inv.id,
      "Finance recorded confirmed bank payment " + p.reference,
      undefined,
      payment,
    );
    return payment;
  });
}
export async function createVendor(a: Actor, input: unknown) {
  internal(a);
  authorize(a, buyers);
  const p = z
    .object({
      name: text,
      email: z.email(),
      countries: z.array(z.string().length(2)).min(1),
      currencies: z.array(z.string().length(3)).min(1),
      categories: z.array(z.string()).default([]),
      deliveryAreas: z.array(z.string()).default([]),
      taxId: z.string().max(100).optional(),
    })
    .parse(input);
  return transaction(async (tx) => {
    const v = await tx.vendor.create({
      data: { ...p, email: p.email.toLowerCase(), tenantId: a.tenantId },
    });
    await audit(
      tx,
      a,
      null,
      "CREATE",
      "Vendor",
      v.id,
      "Vendor claims pending qualification",
      undefined,
      v,
    );
    return v;
  });
}
export async function createDepartment(a: Actor, input: unknown) {
  internal(a);
  const p = z
    .object({ entityId: id, name: text.max(120), costCenter: text.max(80) })
    .parse(input);
  authorize(a, ["GROUP_ADMIN", "ENTITY_ADMIN"], p.entityId);
  return transaction(async (tx) => {
    await entity(tx, a, p.entityId);
    const department = await tx.department.create({
      data: { ...p, tenantId: a.tenantId },
    });
    await audit(
      tx,
      a,
      p.entityId,
      "CREATE",
      "Department",
      department.id,
      "Department added to entity master data",
      undefined,
      department,
    );
    return department;
  });
}
export async function createWarehouse(a: Actor, input: unknown) {
  internal(a);
  const p = z
    .object({ entityId: id, name: text.max(120), location: text.max(500) })
    .parse(input);
  authorize(a, ["GROUP_ADMIN", "ENTITY_ADMIN"], p.entityId);
  return transaction(async (tx) => {
    await entity(tx, a, p.entityId);
    const warehouse = await tx.warehouse.create({
      data: { ...p, tenantId: a.tenantId },
    });
    await audit(
      tx,
      a,
      p.entityId,
      "CREATE",
      "Warehouse",
      warehouse.id,
      "Warehouse added to entity master data",
      undefined,
      warehouse,
    );
    return warehouse;
  });
}
export async function createBudget(a: Actor, input: unknown) {
  internal(a);
  const p = z
    .object({
      entityId: id,
      departmentId: id,
      name: text.max(120),
      period: z.string().trim().min(1).max(40),
      currency: z
        .string()
        .trim()
        .length(3)
        .transform((x) => x.toUpperCase()),
      allocated: positive,
    })
    .parse(input);
  authorize(a, ["GROUP_ADMIN", "ENTITY_ADMIN"], p.entityId);
  return transaction(async (tx) => {
    const e = await entity(tx, a, p.entityId);
    ensure(
      p.currency === e.currency,
      "Budget currency must match the legal entity currency",
    );
    const department = await tx.department.findFirst({
      where: {
        id: p.departmentId,
        tenantId: a.tenantId,
        entityId: p.entityId,
      },
    });
    ensure(department, "Department not found in this entity", 404);
    const budget = await tx.budget.create({
      data: {
        ...p,
        tenantId: a.tenantId,
        committed: 0,
        actual: 0,
      },
    });
    await audit(
      tx,
      a,
      p.entityId,
      "CREATE",
      "Budget",
      budget.id,
      "Budget added to entity master data",
      undefined,
      budget,
    );
    return budget;
  });
}
export async function createProduct(a: Actor, input: unknown) {
  internal(a);
  authorize(a, ["GROUP_ADMIN"]);
  const p = z
    .object({
      sku: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .transform((x) => x.toUpperCase()),
      name: text.max(200),
      category: text.max(120),
      kind: z.enum(["GOODS", "SERVICE"]).default("GOODS"),
      baseUnit: text.max(40),
      purchaseUnit: text.max(40),
      packFactor: positive,
      specifications: z.string().trim().max(2000).default(""),
      reorderPoint: decimal,
      targetStock: positive,
    })
    .parse(input);
  return transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        ...p,
        tenantId: a.tenantId,
        stockTracked: p.kind === "GOODS",
      },
    });
    await audit(
      tx,
      a,
      null,
      "CREATE",
      "Product",
      product.id,
      "Product added to tenant catalog",
      undefined,
      product,
    );
    return product;
  });
}
const importRows = <T extends z.ZodType>(schema: T) =>
  z.array(schema).min(1).max(250, "Import at most 250 rows at a time");
const csvList = (value: string) =>
  value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
export async function importProducts(a: Actor, input: unknown) {
  internal(a);
  authorize(a, ["GROUP_ADMIN"]);
  const rows = importRows(
    z.object({
      sku: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .transform((x) => x.toUpperCase()),
      name: text.max(200),
      category: text.max(120),
      kind: z.enum(["GOODS", "SERVICE"]).default("GOODS"),
      baseUnit: text.max(40),
      purchaseUnit: text.max(40),
      packFactor: positive,
      specifications: z.string().trim().max(2000).default(""),
      reorderPoint: decimal,
      targetStock: positive,
    }),
  ).parse(input);
  const skus = rows.map((row) => row.sku);
  ensure(
    new Set(skus).size === skus.length,
    "CSV contains duplicate product SKUs",
  );
  return transaction(async (tx) => {
    const created = [];
    for (const p of rows) {
      const product = await tx.product.create({
        data: {
          ...p,
          tenantId: a.tenantId,
          stockTracked: p.kind === "GOODS",
        },
      });
      await audit(
        tx,
        a,
        null,
        "IMPORT",
        "Product",
        product.id,
        "Product imported from CSV",
        undefined,
        product,
      );
      created.push(product);
    }
    return { imported: created.length };
  });
}
export async function importVendors(a: Actor, input: unknown) {
  internal(a);
  authorize(a, buyers);
  const rows = importRows(
    z.object({
      name: text.max(400),
      email: z.email(),
      countries: z
        .string()
        .transform((value) => csvList(value).map((item) => item.toUpperCase()))
        .pipe(z.array(z.string().length(2)).min(1)),
      currencies: z
        .string()
        .transform((value) => csvList(value).map((item) => item.toUpperCase()))
        .pipe(z.array(z.string().length(3)).min(1)),
      categories: z.string().default("").transform(csvList),
      deliveryAreas: z.string().default("").transform(csvList),
      taxId: z.string().trim().max(100).default(""),
    }),
  ).parse(input);
  const emails = rows.map((row) => row.email.toLowerCase());
  ensure(
    new Set(emails).size === emails.length,
    "CSV contains duplicate supplier email addresses",
  );
  return transaction(async (tx) => {
    const created = [];
    for (const row of rows) {
      const vendor = await tx.vendor.create({
        data: {
          ...row,
          email: row.email.toLowerCase(),
          taxId: row.taxId || null,
          tenantId: a.tenantId,
        },
      });
      await audit(
        tx,
        a,
        null,
        "IMPORT",
        "Vendor",
        vendor.id,
        "Supplier imported from CSV; qualification remains pending",
        undefined,
        vendor,
      );
      created.push(vendor);
    }
    return { imported: created.length };
  });
}
export async function importSupplierItems(a: Actor, input: unknown) {
  internal(a);
  authorize(a, buyers);
  const rows = importRows(
    z.object({
      vendorEmail: z.email(),
      productSku: z.string().trim().min(1).max(80),
      vendorSku: text,
      unit: text.max(40),
      packFactor: positive,
      price: decimal,
      currency: z
        .string()
        .trim()
        .length(3)
        .transform((x) => x.toUpperCase()),
      moq: positive,
      leadDays: z.number().int().min(0).max(3650),
      country: z
        .string()
        .trim()
        .length(2)
        .transform((x) => x.toUpperCase()),
    }),
  ).parse(input);
  const keys = rows.map(
    (row) =>
      `${row.vendorEmail.toLowerCase()}\u0000${row.productSku.toUpperCase()}\u0000${row.country}`,
  );
  ensure(
    new Set(keys).size === keys.length,
    "CSV contains duplicate supplier, product and country combinations",
  );
  return transaction(async (tx) => {
    const vendors = await tx.vendor.findMany({
      where: {
        tenantId: a.tenantId,
        email: {
          in: [...new Set(rows.map((row) => row.vendorEmail.toLowerCase()))],
        },
      },
    });
    const products = await tx.product.findMany({
      where: {
        tenantId: a.tenantId,
        sku: {
          in: [...new Set(rows.map((row) => row.productSku.toUpperCase()))],
        },
      },
    });
    const vendorByEmail = new Map(
      vendors.map((vendor) => [vendor.email, vendor]),
    );
    const productBySku = new Map(
      products.map((product) => [product.sku, product]),
    );
    const missing = rows.flatMap((row, index) => {
      const absent = [];
      if (!vendorByEmail.has(row.vendorEmail.toLowerCase()))
        absent.push(`row ${index + 2}: supplier ${row.vendorEmail} not found`);
      if (!productBySku.has(row.productSku.toUpperCase()))
        absent.push(`row ${index + 2}: product ${row.productSku} not found`);
      return absent;
    });
    ensure(!missing.length, missing.join("; "), 404);
    let imported = 0;
    for (const row of rows) {
      const vendor = vendorByEmail.get(row.vendorEmail.toLowerCase())!;
      const product = productBySku.get(row.productSku.toUpperCase())!;
      const mappingData = {
        vendorSku: row.vendorSku,
        unit: row.unit,
        packFactor: row.packFactor,
        price: row.price,
        currency: row.currency,
        moq: row.moq,
        leadDays: row.leadDays,
        country: row.country,
      };
      const key = {
        vendorId_productId_country: {
          vendorId: vendor.id,
          productId: product.id,
          country: row.country,
        },
      };
      const old = await tx.supplierItem.findUnique({ where: key });
      const priceHistory = old
        ? [
            ...(old.priceHistory as Prisma.JsonArray),
            {
              price: old.price.toString(),
              currency: old.currency,
              at: old.verifiedAt?.toISOString() ?? null,
            },
          ]
        : [];
      const mapping = await tx.supplierItem.upsert({
        where: key,
        create: {
          ...mappingData,
          vendorId: vendor.id,
          productId: product.id,
          tenantId: a.tenantId,
          verifiedAt: new Date(),
        },
        update: {
          ...mappingData,
          tenantId: a.tenantId,
          priceHistory,
          verifiedAt: new Date(),
        },
      });
      await audit(
        tx,
        a,
        null,
        "IMPORT",
        "SupplierItem",
        mapping.id,
        old
          ? "Supplier pricing and mapping enriched from CSV"
          : "Supplier mapping imported from CSV",
        old,
        mapping,
      );
      imported++;
    }
    return { imported };
  });
}
export async function qualifyVendor(
  a: Actor,
  vendorId: string,
  input: unknown,
) {
  internal(a);
  authorize(a, ["GROUP_ADMIN", "ENTITY_ADMIN"]);
  const p = z
    .object({
      status: z.enum(["APPROVED", "BLOCKED", "SUSPENDED"]),
      reason: text,
    })
    .parse(input);
  return transaction(async (tx) => {
    const v = await tx.vendor.findFirst({
      where: { id: vendorId, tenantId: a.tenantId },
    });
    ensure(v, "Vendor not found", 404);
    const result = await tx.vendor.update({
      where: { id: v.id },
      data: {
        ...p,
        verifiedAt: p.status === "APPROVED" ? new Date() : v.verifiedAt,
        qualification:
          p.status === "APPROVED" ? "Internally verified" : "Restricted",
      },
    });
    await audit(tx, a, null, "QUALIFY", "Vendor", v.id, p.reason, v, result);
    return result;
  });
}
export async function inviteVendor(a: Actor, vendorId: string, input: unknown) {
  internal(a);
  const p = z.object({ entityId: id }).parse(input);
  authorize(a, buyers, p.entityId);
  return transaction(async (tx) => {
    await entity(tx, a, p.entityId);
    const v = await tx.vendor.findFirst({
      where: { id: vendorId, tenantId: a.tenantId },
    });
    ensure(v, "Vendor not found", 404);
    ensure(
      !(await tx.user.count({ where: { email: v.email } })),
      "Vendor contact already has an account",
    );
    const token = randomBytes(32).toString("hex");
    const inv = await tx.invitation.create({
      data: {
        tenantId: a.tenantId,
        entityId: p.entityId,
        vendorId: v.id,
        email: v.email,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    await tx.job.create({
      data: {
        tenantId: a.tenantId,
        entityId: p.entityId,
        type: "ONBOARDING",
        payload: {
          email: v.email,
          invitationId: inv.id,
          acceptUrl:
            (process.env.APP_URL ?? "http://localhost:3000") +
            "/login?invite=" +
            token,
        },
      },
    });
    await audit(
      tx,
      a,
      p.entityId,
      "INVITE",
      "Vendor",
      v.id,
      "Onboarding link queued",
    );
    return { id: inv.id, status: inv.status };
  });
}
export async function supplierMapping(a: Actor, input: unknown) {
  internal(a);
  authorize(a, buyers);
  const p = z
    .object({
      vendorId: id,
      productId: id,
      vendorSku: text,
      unit: text,
      packFactor: positive,
      price: decimal,
      currency: z.string().length(3),
      moq: positive,
      leadDays: z.number().int().min(0).max(3650),
      country: z.string().length(2),
    })
    .parse(input);
  return transaction(async (tx) => {
    await products(tx, a, [p.productId]);
    const v = await tx.vendor.findFirst({
      where: { id: p.vendorId, tenantId: a.tenantId },
    });
    ensure(v, "Vendor not found", 404);
    const old = await tx.supplierItem.findUnique({
      where: {
        vendorId_productId_country: {
          vendorId: p.vendorId,
          productId: p.productId,
          country: p.country,
        },
      },
    });
    const history = old
      ? [
          ...(old.priceHistory as Prisma.JsonArray),
          {
            price: old.price.toString(),
            currency: old.currency,
            at: old.verifiedAt?.toISOString() ?? null,
          },
        ]
      : [];
    const result = await tx.supplierItem.upsert({
      where: {
        vendorId_productId_country: {
          vendorId: p.vendorId,
          productId: p.productId,
          country: p.country,
        },
      },
      create: { ...p, tenantId: a.tenantId, verifiedAt: new Date() },
      update: { ...p, priceHistory: history, verifiedAt: new Date() },
    });
    await audit(
      tx,
      a,
      null,
      "VERIFY_MAPPING",
      "SupplierItem",
      result.id,
      "Supplier-to-product link verified",
      old,
      result,
    );
    return result;
  });
}
export async function executeOnce(
  a: Actor,
  key: string,
  operation: string,
  fn: (tx: Tx) => Promise<unknown>,
) {
  ensure(
    /^[A-Za-z0-9_-]{8,100}$/.test(key),
    "Supply an Idempotency-Key header (8–100 characters)",
  );
  return transaction(async (tx) => {
    const old = await tx.idempotency.findUnique({
      where: { tenantId_key: { tenantId: a.tenantId, key } },
    });
    if (old) {
      ensure(
        old.actorId === a.id && old.operation === operation,
        "Idempotency key already used by another operation",
        409,
      );
      return old.result;
    }
    const result = await fn(tx);
    const serialized = JSON.parse(JSON.stringify(result));
    await tx.idempotency.create({
      data: {
        tenantId: a.tenantId,
        key,
        actorId: a.id,
        operation,
        result: serialized,
      },
    });
    return serialized;
  });
}
// Receipt owns its transaction; use its unique posting key and recover a committed retry.
export async function receiveOnce(
  a: Actor,
  poId: string,
  input: unknown,
  key: string,
) {
  ensure(
    /^[A-Za-z0-9_-]{8,100}$/.test(key),
    "Supply an Idempotency-Key header (8–100 characters)",
  );
  const prior = await db.receipt.findFirst({
    where: { tenantId: a.tenantId, idempotencyKey: key },
  });
  if (prior) {
    authorize(a, warehouseRoles, prior.entityId);
    ensure(
      prior.purchaseOrderId === poId && prior.postedBy === a.id,
      "Posting key belongs to a different receipt",
      409,
    );
    return prior;
  }
  try {
    return await receive(a, poId, input, key);
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const posted = await db.receipt.findFirst({
        where: {
          tenantId: a.tenantId,
          idempotencyKey: key,
          purchaseOrderId: poId,
          postedBy: a.id,
        },
      });
      if (posted) {
        authorize(a, warehouseRoles, posted.entityId);
        return posted;
      }
    }
    throw e;
  }
}
export const serviceRoles = { buyers, approvers, warehouseRoles, financeRoles };
