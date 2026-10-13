import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { Actor } from "../src/lib/auth";
import * as s from "../src/lib/services";
export async function seed() {
  const password = process.env.DEMO_PASSWORD;
  if (
    process.env.ALLOW_DEMO_SEED !== "true" ||
    !password ||
    password.length < 14
  )
    throw new Error(
      "Set ALLOW_DEMO_SEED=true and a DEMO_PASSWORD of at least 14 characters. Never seed a live database.",
    );
  if (await db.tenant.findUnique({ where: { id: "tenant-atlas" } })) {
    console.log("Demo tenant already exists; seed does not overwrite data.");
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await db.tenant.createMany({
    data: [
      { id: "tenant-atlas", name: "Fictional Meridian Group" },
      { id: "tenant-other", name: "Fictional Horizon Industries" },
    ],
  });
  const entities = [
    {
      id: "entity-eg",
      tenantId: "tenant-atlas",
      name: "Meridian Egypt",
      country: "EG",
      currency: "EGP",
      timezone: "Africa/Cairo",
    },
    {
      id: "entity-ae",
      tenantId: "tenant-atlas",
      name: "Meridian UAE",
      country: "AE",
      currency: "AED",
      timezone: "Asia/Dubai",
    },
    {
      id: "entity-gb",
      tenantId: "tenant-atlas",
      name: "Meridian UK",
      country: "GB",
      currency: "GBP",
      timezone: "Europe/London",
    },
    {
      id: "entity-other",
      tenantId: "tenant-other",
      name: "Horizon Egypt",
      country: "EG",
      currency: "EGP",
      timezone: "Africa/Cairo",
    },
  ];
  for (const e of entities) {
    await db.entity.create({
      data: {
        ...e,
        policy: {
          selfApproval: false,
          allowOverBudget: false,
          priceTolerancePercent: 0,
          recoverableTax: true,
          approvalMode: "SINGLE_SEPARATE_APPROVER",
        },
      },
    });
    await db.department.create({
      data: {
        id: "dep-" + e.id,
        tenantId: e.tenantId,
        entityId: e.id,
        name: "Operations",
        costCenter: "OPS-01",
      },
    });
    await db.warehouse.create({
      data: {
        id: "wh-" + e.id,
        tenantId: e.tenantId,
        entityId: e.id,
        name: e.name + " central warehouse",
        location:
          e.country === "EG"
            ? "Cairo · Fictional Demo Business Park"
            : e.country === "AE"
              ? "Dubai · Fictional Demo Business Park"
              : "London · Fictional Demo Business Park",
      },
    });
    await db.budget.create({
      data: {
        id: "budget-" + e.id,
        tenantId: e.tenantId,
        entityId: e.id,
        departmentId: "dep-" + e.id,
        name: "Office & operations · FY2026",
        period: "2026",
        currency: e.currency,
        allocated: 1000000,
      },
    });
  }
  for (const [key, role] of Object.entries({
    admin: "GROUP_ADMIN",
    buyer: "BUYER",
    requester: "REQUESTER",
    approver: "APPROVER",
    warehouse: "WAREHOUSE",
    finance: "FINANCE",
    auditor: "AUDITOR",
  })) {
    await db.user.create({
      data: {
        id: "user-" + key,
        tenantId: "tenant-atlas",
        name: "Demo " + key[0].toUpperCase() + key.slice(1),
        email: key + "@atlas.example",
        passwordHash,
        role,
        memberships: {
          create: ["entity-eg", "entity-ae", "entity-gb"].map((entityId) => ({
            entityId,
          })),
        },
      },
    });
  }
  await db.user.create({
    data: {
      id: "user-other",
      tenantId: "tenant-other",
      name: "Other tenant administrator",
      email: "other@atlas.example",
      passwordHash,
      role: "GROUP_ADMIN",
      memberships: { create: { entityId: "entity-other" } },
    },
  });
  const vendorNames = [
    "Cedar Office Supply",
    "Northstar Essentials",
    "Blue Harbor Industrial",
    "Juniper Paperworks",
    "Nova Technology",
    "Pioneer Packaging",
    "Oakridge Education",
    "Silverline Facilities",
  ];
  for (let i = 0; i < 8; i++) {
    const vendorId = "vendor-" + (i + 1);
    await db.vendor.create({
      data: {
        id: vendorId,
        tenantId: "tenant-atlas",
        name: vendorNames[i] + " [fictional]",
        email: "vendor" + (i + 1) + "@atlas.example",
        countries: ["EG", "AE", "GB"],
        currencies: ["EGP", "AED", "GBP", "USD"],
        deliveryAreas: ["Cairo", "Dubai", "London"],
        categories: [
          i % 2 ? "Office supplies" : "Paper & print",
          "Procurement",
        ],
        status: "APPROVED",
        verifiedAt: new Date(),
        qualification: "Demo qualification only",
        paymentTerms: i % 2 ? "Net 45" : "Net 30",
        score: 85 + i,
      },
    });
    await db.user.create({
      data: {
        id: "user-vendor-" + (i + 1),
        tenantId: "tenant-atlas",
        name: vendorNames[i] + " portal administrator",
        email: "vendor" + (i + 1) + "@atlas.example",
        passwordHash,
        role: "VENDOR_ADMIN",
        vendorId,
      },
    });
  }
  await db.vendor.create({
    data: {
      id: "vendor-other",
      tenantId: "tenant-other",
      name: "Other tenant supplier",
      email: "supplier@horizon.example",
      countries: ["EG"],
      currencies: ["EGP"],
      deliveryAreas: ["Cairo"],
      categories: ["Office supplies"],
      status: "APPROVED",
    },
  });
  const productNames = [
    "A4 copy paper 80gsm",
    "Black ballpoint pen",
    "Printer toner cartridge",
    "Archive box",
    "Spiral notebook",
    "Highlighter pack",
    "DL envelope",
    "Stapler",
    "Staples box",
    "Binder clips",
    "Whiteboard marker",
    "Desk organizer",
    "USB keyboard",
    "Wireless mouse",
    "Label tape",
    "Packing tape",
    "Document folder",
    "Lever arch file",
    "Calculator",
    "Scissors",
    "Glue stick",
    "Sticky notes",
    "Whiteboard eraser",
    "Projector cable",
    "Cleaning wipes",
    "Pantry coffee",
    "Printer maintenance service",
    "IT support service",
    "Office chair",
    "Shipping service",
  ];
  for (let i = 0; i < 30; i++) {
    const service = [26, 27, 29].includes(i);
    await db.product.create({
      data: {
        id: "product-" + (i + 1),
        tenantId: "tenant-atlas",
        sku: "ATL-" + String(i + 1).padStart(4, "0"),
        name: productNames[i],
        category: service
          ? "Services"
          : i < 12
            ? "Stationery"
            : i < 24
              ? "Office equipment"
              : "Facilities",
        kind: service ? "SERVICE" : "GOODS",
        baseUnit: service ? "service" : "piece",
        purchaseUnit: i === 0 ? "box" : "piece",
        packFactor: i === 0 ? 5 : 1,
        stockTracked: !service,
        reorderPoint: 10,
        targetStock: 100,
        manufacturer: "Fictional demo manufacturer",
        specifications:
          "Demonstration item; verify technical requirements before real purchasing",
      },
    });
    for (let v = 1; v <= 4; v++)
      await db.supplierItem.create({
        data: {
          tenantId: "tenant-atlas",
          vendorId: "vendor-" + v,
          productId: "product-" + (i + 1),
          vendorSku: "V" + v + "-" + (i + 1),
          unit: i === 0 ? "box" : "piece",
          packFactor: i === 0 ? 5 : 1,
          price: (i + 1) * 10 + v,
          currency: "EGP",
          moq: 1,
          leadDays: v + 1,
          country: "EG",
          verifiedAt: new Date(),
        },
      });
  }
  await db.product.create({
    data: {
      id: "product-other",
      tenantId: "tenant-other",
      sku: "HOR-001",
      name: "Private other tenant product",
      category: "Office",
      packFactor: 1,
    },
  });
  const a = (key: string): Actor => ({
    id: "user-" + key,
    tenantId: "tenant-atlas",
    role: {
      buyer: "BUYER",
      requester: "REQUESTER",
      approver: "APPROVER",
      warehouse: "WAREHOUSE",
      finance: "FINANCE",
    }[key]!,
    vendorId: null,
    entityIds: ["entity-eg", "entity-ae", "entity-gb"],
    name: "Demo " + key,
  });
  const req = await s.createRequisition(a("requester"), {
    entityId: "entity-eg",
    departmentId: "dep-entity-eg",
    warehouseId: "wh-entity-eg",
    budgetId: "budget-entity-eg",
    justification: "Replenish paper and pens for Cairo operations",
    requiredAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    lines: [
      { productId: "product-1", quantity: 100, estimatedUnitPrice: 12 },
      { productId: "product-2", quantity: 100, estimatedUnitPrice: 12 },
    ],
  });
  await s.submitRequisition(a("requester"), req.id);
  const reqAp = await db.approval.findFirstOrThrow({
    where: { targetId: req.id },
  });
  await s.decideApproval(a("approver"), reqAp.id, {
    decision: "APPROVED",
    reason: "Office replenishment within approved budget",
  });
  const rfq = await s.createRfq(a("buyer"), {
    requisitionId: req.id,
    title: "Cairo · paper & stationery replenishment",
    deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
    sealed: false,
  });
  await s.inviteRfq(a("buyer"), rfq.id, {
    vendorIds: ["vendor-1", "vendor-2", "vendor-3"],
  });
  const offer = (
    vendorId: string,
    unitPrice: number,
    freight: number,
    factor = 1,
  ) => ({
    vendorId,
    currency: "EGP",
    fxRate: 1,
    fxSource: "Entity base currency",
    fxAt: new Date().toISOString(),
    freight,
    otherCharges: 0,
    paymentTerms: "Net 30",
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
    leadDays: vendorId === "vendor-1" ? 7 : 3,
    source: "EMAIL",
    lines: rfq.lines.map((l) => ({
      rfqLineId: l.id,
      offeredQuantity: 100 / factor,
      packFactor: factor,
      unitPrice: unitPrice * factor,
      taxPercent: 14,
      taxRecoverable: true,
      moq: 1,
      compliant: true,
    })),
  });
  const cheap = await s.submitQuote(
    a("buyer"),
    rfq.id,
    offer("vendor-1", 10, 700, 5),
  );
  const value = await s.submitQuote(
    a("buyer"),
    rfq.id,
    offer("vendor-2", 12, 50),
  );
  await s.submitQuote(a("buyer"), rfq.id, offer("vendor-3", 13, 100));
  await s.openRfq(a("buyer"), rfq.id);
  const aw = await s.proposeAward(a("buyer"), rfq.id, {
    reason:
      "Supplier 2 offers lower delivered cost despite a higher unit price. Split allocation demonstrates two supplier orders and freight per supplier.",
    lines: rfq.lines.flatMap((l) => [
      {
        quoteLineId: value.lines.find((x) => x.rfqLineId === l.id)!.id,
        quantity: 75,
      },
      {
        quoteLineId: cheap.lines.find((x) => x.rfqLineId === l.id)!.id,
        quantity: 25,
      },
    ]),
  });
  const awardAp = await db.approval.findFirstOrThrow({
    where: { targetId: aw.id },
  });
  await s.decideApproval(a("approver"), awardAp.id, {
    decision: "APPROVED",
    reason: "Demonstration split award approved after delivered-cost review",
  });
  const po = await db.purchaseOrder.findFirstOrThrow({
    where: { awardId: aw.id, vendorId: "vendor-2" },
    include: { lines: true },
  });
  await s.receiveOnce(
    a("warehouse"),
    po.id,
    {
      lines: po.lines.map((l) => ({
        purchaseOrderLineId: l.id,
        accepted: 30,
        rejected: 5,
        reason: "30 accepted; 5 damaged and quarantined",
      })),
    },
    "demo-receipt-001",
  );
  await s.createInvoice(a("finance"), po.id, {
    number: "DEMO-INV-001",
    dueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    freight: 0,
    otherCharges: 0,
    lines: po.lines.map((l) => ({
      purchaseOrderLineId: l.id,
      quantity: 20,
      unitPrice: l.unitPrice.toString(),
    })),
  });
  await s.createInvoice(a("finance"), po.id, {
    number: "DEMO-EXCEPTION-002",
    dueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    freight: 0,
    otherCharges: 0,
    lines: po.lines.map((l) => ({
      purchaseOrderLineId: l.id,
      quantity: 60,
      unitPrice: 20,
    })),
  });
  const pending = await s.createRequisition(a("requester"), {
    entityId: "entity-ae",
    departmentId: "dep-entity-ae",
    warehouseId: "wh-entity-ae",
    budgetId: "budget-entity-ae",
    justification: "Quarterly office equipment replenishment",
    requiredAt: new Date(Date.now() + 14 * 86400000).toISOString(),
    lines: [
      { productId: "product-13", quantity: 15, estimatedUnitPrice: 100 },
      { productId: "product-14", quantity: 15, estimatedUnitPrice: 50 },
    ],
  });
  await s.submitRequisition(a("requester"), pending.id);
  await db.contract.create({
    data: {
      id: "contract-demo",
      tenantId: "tenant-atlas",
      entityId: "entity-eg",
      vendorId: "vendor-2",
      reference: "DEMO-CON-2026",
      name: "Fictional office supply framework",
      validFrom: new Date("2026-01-01"),
      validUntil: new Date(Date.now() + 90 * 86400000),
      currency: "EGP",
      ceiling: 500000,
      categories: ["Stationery"],
    },
  });
  console.log(
    "Fictional seed ready: 2 tenants, 4 entities, 8 main-tenant vendors, 30 catalog items, split award, partial/rejected receipt and invoice exception.",
  );
}
if (process.argv[1]?.endsWith("seed.ts"))
  seed()
    .then(() => db.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await db.$disconnect();
      process.exit(1);
    });
