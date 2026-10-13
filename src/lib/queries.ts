import { db, transaction } from "./db";
import { Actor, internal, scope, DomainError } from "./auth";
import { stock } from "./services";
import { D, money } from "./money";
export async function workspace(a: Actor) {
  if (a.vendorId) {
    const vendor = await db.vendor.findFirst({
      where: { id: a.vendorId, tenantId: a.tenantId },
    });
    if (!vendor || vendor.status !== "APPROVED")
      return {
        actor: a,
        vendor,
        entities: [],
        rfqs: [],
        quotes: [],
        orders: [],
        products: [],
        blocked: true,
      };
    const invitations = await db.rfqVendor.findMany({
      where: { tenantId: a.tenantId, vendorId: a.vendorId },
      include: { rfq: { include: { lines: true } } },
    });
    const orders = await db.purchaseOrder.findMany({
      where: { tenantId: a.tenantId, vendorId: a.vendorId },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    });
    const quotes = await db.quote.findMany({
      where: { tenantId: a.tenantId, vendorId: a.vendorId },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    });
    const products = await db.product.findMany({
      where: {
        tenantId: a.tenantId,
        id: {
          in: [
            ...invitations.flatMap((x) => x.rfq.lines.map((l) => l.productId)),
            ...orders.flatMap((x) => x.lines.map((l) => l.productId)),
          ],
        },
      },
    });
    const entities = await db.entity.findMany({
      where: {
        tenantId: a.tenantId,
        id: { in: invitations.map((x) => x.rfq.entityId) },
      },
    });
    return {
      actor: a,
      vendor,
      entities,
      rfqs: invitations.map((x) => ({
        ...x.rfq,
        invitationStatus: x.status,
        acknowledgedVersion: x.acknowledgedVersion,
      })),
      quotes,
      orders,
      products,
      blocked: false,
    };
  }
  internal(a);
  const s = scope(a);
  const [
    entities,
    departments,
    warehouses,
    vendors,
    products,
    mappings,
    budgets,
    requisitions,
    approvals,
    rfqs,
    orders,
    receipts,
    invoices,
    contracts,
    movements,
    jobs,
    audits,
    invitations,
    documents,
  ] = await Promise.all([
    db.entity.findMany({
      where: {
        tenantId: a.tenantId,
        ...(a.role === "GROUP_ADMIN" ? {} : { id: { in: a.entityIds } }),
      },
    }),
    db.department.findMany({ where: s }),
    db.warehouse.findMany({ where: s }),
    db.vendor.findMany({
      where: { tenantId: a.tenantId },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({
      where: { tenantId: a.tenantId },
      orderBy: { sku: "asc" },
    }),
    db.supplierItem.findMany({ where: { tenantId: a.tenantId } }),
    db.budget.findMany({ where: s }),
    db.requisition.findMany({
      where: s,
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    }),
    db.approval.findMany({ where: s, orderBy: { createdAt: "desc" } }),
    db.rfq.findMany({
      where: s,
      include: { lines: true, vendors: true },
      orderBy: { createdAt: "desc" },
    }),
    db.purchaseOrder.findMany({
      where: s,
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    }),
    db.receipt.findMany({
      where: s,
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    }),
    db.invoice.findMany({
      where: s,
      include: { lines: true, payments: true },
      orderBy: { createdAt: "desc" },
    }),
    db.contract.findMany({ where: s }),
    db.stockMovement.findMany({
      where: s,
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.job.findMany({
      where: s,
      select: {
        id: true,
        type: true,
        status: true,
        attempts: true,
        lastError: true,
        createdAt: true,
        deliveredAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.audit.findMany({
      where: {
        tenantId: a.tenantId,
        ...(a.role === "GROUP_ADMIN"
          ? {}
          : { OR: [{ entityId: { in: a.entityIds } }, { entityId: null }] }),
      },
      select: {
        id: true,
        tenantId: true,
        entityId: true,
        actorId: true,
        action: true,
        targetType: true,
        targetId: true,
        reason: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.invitation.findMany({
      where: s,
      select: {
        id: true,
        vendorId: true,
        email: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
      },
    }),
    db.document.findMany({
      where: s,
      select: {
        id: true,
        name: true,
        scanStatus: true,
        size: true,
        contentType: true,
        expiresAt: true,
        createdAt: true,
      },
    }),
  ]);
  const inventory = await transaction(async (tx) =>
    Promise.all(
      warehouses.flatMap((w) =>
        products
          .filter((p) => p.stockTracked)
          .map(async (p) => {
            const balance = await stock(tx, a, w.entityId, w.id, p.id);
            const incoming = orders
              .filter(
                (o) =>
                  o.warehouseId === w.id &&
                  ["ISSUED", "ACKNOWLEDGED", "PARTIAL"].includes(o.status),
              )
              .flatMap((o) => o.lines)
              .filter((l) => l.productId === p.id)
              .reduce((n, l) => n.plus(D(l.quantity).minus(l.received)), D(0));
            const recommendation = D(p.targetStock)
              .minus(balance.available)
              .minus(incoming);
            const entity = entities.find((e) => e.id === w.entityId)!;
            return {
              id: w.id + ":" + p.id,
              entityId: w.entityId,
              warehouseId: w.id,
              warehouse: w.name,
              productId: p.id,
              sku: p.sku,
              name: p.name,
              unit: p.baseUnit,
              ...balance,
              incoming: money(incoming),
              low: D(balance.available).lte(p.reorderPoint),
              recommendation: money(recommendation.gt(0) ? recommendation : 0),
              supplierIds: mappings
                .filter(
                  (m) =>
                    m.productId === p.id &&
                    m.country === entity.country &&
                    vendors.some(
                      (v) => v.id === m.vendorId && v.status === "APPROVED",
                    ),
                )
                .map((m) => m.vendorId),
            };
          }),
      ),
    ),
  );
  const performance = vendors.map((v) => {
    const pos = orders.filter((o) => o.vendorId === v.id);
    const lines = pos.flatMap((o) => o.lines);
    const ordered = lines.reduce((n, l) => n.plus(l.quantity), D(0)),
      accepted = lines.reduce((n, l) => n.plus(l.received), D(0)),
      rejected = lines.reduce((n, l) => n.plus(l.rejected), D(0));
    return {
      vendorId: v.id,
      name: v.name,
      orders: pos.length,
      fillRate: ordered.gt(0)
        ? Number(accepted.div(ordered).times(100).toFixed(1))
        : null,
      rejectedUnits: money(rejected),
      verifiedScore: v.score,
    };
  });
  return {
    actor: a,
    entities,
    departments,
    warehouses,
    vendors,
    products,
    mappings,
    budgets,
    requisitions,
    approvals,
    rfqs,
    orders,
    receipts,
    invoices,
    contracts,
    movements,
    jobs,
    audits,
    invitations,
    documents,
    inventory,
    performance,
    integrationStatus: {
      email:
        process.env.EMAIL_MODE === "smtp"
          ? "SMTP configured; inspect delivery log"
          : "Development inbox (Mailpit); no external invitations",
      storage: process.env.S3_ENDPOINT
        ? "S3 configured; downloads require clean scan"
        : "Unconfigured; uploads unavailable",
      erp: "Odoo / SAP / Dynamics / Oracle adapters unimplemented",
      identity: "Local authentication; production SSO unimplemented",
      reminders:
        "Worker schedules RFQ-deadline reminders; contract-expiry reminders unimplemented",
    },
  };
}
export async function orderDocument(a: Actor, id: string) {
  const po = await db.purchaseOrder.findFirst({
    where: {
      id,
      ...(a.vendorId
        ? { tenantId: a.tenantId, vendorId: a.vendorId }
        : scope(a)),
    },
    include: { lines: true },
  });
  if (!po) throw new DomainError("Order not found", 404);
  const [entity, vendor, warehouse, products, approval] = await Promise.all([
    db.entity.findUnique({ where: { id: po.entityId } }),
    db.vendor.findUnique({ where: { id: po.vendorId } }),
    db.warehouse.findUnique({ where: { id: po.warehouseId } }),
    db.product.findMany({
      where: {
        tenantId: a.tenantId,
        id: { in: po.lines.map((l) => l.productId) },
      },
    }),
    db.approval.findFirst({
      where: {
        tenantId: a.tenantId,
        targetType: "AWARD",
        targetId: po.awardId,
        status: "APPROVED",
      },
    }),
  ]);
  return { po, entity, vendor, warehouse, products, approval };
}
