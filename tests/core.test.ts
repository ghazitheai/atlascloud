import { describe, it, expect, vi } from "vitest";
const { cookieJar } = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      cookieJar.has(key) ? { value: cookieJar.get(key) } : undefined,
    set: (key: string, value: string) => cookieJar.set(key, value),
    delete: (key: string) => cookieJar.delete(key),
  }),
}));
import type { Actor } from "../src/lib/auth";
const a = (
  key: string,
  entityIds = ["entity-eg", "entity-ae", "entity-gb"],
): Actor => ({
  id: "user-" + key,
  tenantId: "tenant-atlas",
  role:
    (
      {
        buyer: "BUYER",
        requester: "REQUESTER",
        approver: "APPROVER",
        warehouse: "WAREHOUSE",
        finance: "FINANCE",
        admin: "GROUP_ADMIN",
        auditor: "AUDITOR",
      } as Record<string, string>
    )[key] ?? "VENDOR_ADMIN",
  vendorId: key.startsWith("vendor-") ? key : null,
  entityIds,
  name: "Test " + key,
});
const other: Actor = {
  id: "user-other",
  tenantId: "tenant-other",
  role: "GROUP_ADMIN",
  vendorId: null,
  entityIds: ["entity-other"],
  name: "Other",
};
async function libs() {
  return {
    s: await import("../src/lib/services"),
    q: await import("../src/lib/queries"),
    db: (await import("../src/lib/db")).db,
    m: await import("../src/lib/money"),
  };
}
async function draft() {
  const { s } = await libs();
  return s.createRequisition(a("requester"), {
    entityId: "entity-eg",
    departmentId: "dep-entity-eg",
    warehouseId: "wh-entity-eg",
    budgetId: "budget-entity-eg",
    justification: "Test office replenishment",
    requiredAt: new Date(Date.now() + 86400000).toISOString(),
    lines: [{ productId: "product-1", quantity: 20, estimatedUnitPrice: 12 }],
  });
}
describe("Procurement core · database-backed verification", () => {
  it("seeds a split award, partial receipt and invoice exception", async () => {
    const { db } = await libs();
    expect(await db.tenant.count()).toBe(2);
    expect(
      await db.product.count({ where: { tenantId: "tenant-atlas" } }),
    ).toBe(30);
    expect(await db.vendor.count({ where: { tenantId: "tenant-atlas" } })).toBe(
      8,
    );
    const aw = await db.award.findFirstOrThrow({
      where: { status: "APPROVED" },
    });
    expect(await db.purchaseOrder.count({ where: { awardId: aw.id } })).toBe(2);
    expect(await db.invoice.count({ where: { status: "EXCEPTION" } })).toBe(1);
  });
  it("isolates tenants and refuses cross-tenant product references", async () => {
    const { s, q } = await libs();
    const w = await q.workspace(other);
    expect(w.products.map((p) => p.id)).toEqual(["product-other"]);
    expect(w.orders).toHaveLength(0);
    await expect(
      s.createRequisition(a("requester"), {
        entityId: "entity-eg",
        departmentId: "dep-entity-eg",
        warehouseId: "wh-entity-eg",
        justification: "Invalid tenant product",
        requiredAt: new Date(Date.now() + 86400000).toISOString(),
        lines: [
          { productId: "product-other", quantity: 1, estimatedUnitPrice: 1 },
        ],
      }),
    ).rejects.toThrow("Product not found");
  });
  it("lets administrators configure the master data required for requisitions", async () => {
    const { s, db } = await libs();
    const admin = a("admin");
    const department = await s.createDepartment(admin, {
      entityId: "entity-eg",
      name: "New Test Operations",
      costCenter: "TEST-OPS",
    });
    const warehouse = await s.createWarehouse(admin, {
      entityId: "entity-eg",
      name: "New Test Warehouse",
      location: "Fictional test location",
    });
    const budget = await s.createBudget(admin, {
      entityId: "entity-eg",
      departmentId: department.id,
      name: "New Test Annual Budget",
      period: "FY2026",
      currency: "EGP",
      allocated: "10000",
    });
    const product = await s.createProduct(admin, {
      sku: "new-test-item",
      name: "New test item",
      category: "Testing",
      kind: "GOODS",
      baseUnit: "piece",
      purchaseUnit: "box",
      packFactor: "10",
      reorderPoint: "2",
      targetStock: "100",
    });
    expect(department.tenantId).toBe(admin.tenantId);
    expect(warehouse.entityId).toBe("entity-eg");
    expect(budget.departmentId).toBe(department.id);
    expect(budget.currency).toBe("EGP");
    expect(product.sku).toBe("NEW-TEST-ITEM");
    expect(product.stockTracked).toBe(true);
    expect(
      await db.audit.count({
        where: {
          targetId: {
            in: [department.id, warehouse.id, budget.id, product.id],
          },
        },
      }),
    ).toBe(4);
    await expect(
      s.createProduct(a("buyer"), {
        sku: "unauthorized-test-item",
        name: "Unauthorized item",
        category: "Testing",
        baseUnit: "piece",
        purchaseUnit: "piece",
        packFactor: 1,
        reorderPoint: 0,
        targetStock: 1,
      }),
    ).rejects.toThrow("permission");
    await expect(
      s.createBudget(admin, {
        entityId: "entity-eg",
        departmentId: "dep-entity-ae",
        name: "Invalid cross-entity budget",
        period: "FY2026",
        currency: "EGP",
        allocated: 100,
      }),
    ).rejects.toThrow("Department not found");
  });
  it("imports catalog, suppliers and supplier enrichment atomically with audit history", async () => {
    const { s, db } = await libs();
    const admin = a("admin");
    const productResult = await s.importProducts(admin, [
      {
        sku: "CSV-IMPORT-01",
        name: "Imported test product",
        category: "Testing",
        kind: "GOODS",
        baseUnit: "piece",
        purchaseUnit: "box",
        packFactor: "12",
        reorderPoint: "2",
        targetStock: "24",
      },
    ]);
    const vendorResult = await s.importVendors(a("buyer"), [
      {
        name: "Imported test supplier",
        email: "CSV-Vendor@atlas.example",
        countries: "eg;ae",
        currencies: "egp;aed",
        categories: "Office;Paper",
        deliveryAreas: "Cairo;Alexandria",
      },
    ]);
    expect(productResult.imported).toBe(1);
    expect(vendorResult.imported).toBe(1);
    const mapping = {
      vendorEmail: "csv-vendor@atlas.example",
      productSku: "csv-import-01",
      vendorSku: "CSV-V-01",
      unit: "box",
      packFactor: "12",
      price: "120",
      currency: "egp",
      moq: "2",
      leadDays: 7,
      country: "eg",
    };
    expect((await s.importSupplierItems(a("buyer"), [mapping])).imported).toBe(
      1,
    );
    expect(
      (await s.importSupplierItems(a("buyer"), [{ ...mapping, price: "132" }]))
        .imported,
    ).toBe(1);
    const importedVendor = await db.vendor.findUniqueOrThrow({
      where: {
        tenantId_email: {
          tenantId: admin.tenantId,
          email: "csv-vendor@atlas.example",
        },
      },
    });
    const importedProduct = await db.product.findUniqueOrThrow({
      where: {
        tenantId_sku: {
          tenantId: admin.tenantId,
          sku: "CSV-IMPORT-01",
        },
      },
    });
    expect(importedVendor.status).toBe("PENDING");
    expect(importedVendor.countries).toEqual(["EG", "AE"]);
    expect(importedProduct.stockTracked).toBe(true);
    const enriched = await db.supplierItem.findUniqueOrThrow({
      where: {
        vendorId_productId_country: {
          vendorId: importedVendor.id,
          productId: importedProduct.id,
          country: "EG",
        },
      },
    });
    expect(enriched.price.toString()).toBe("132");
    expect(enriched.priceHistory).toHaveLength(1);
    await expect(
      s.importProducts(a("buyer"), [
        {
          sku: "NOT-AUTHORIZED",
          name: "Not authorized",
          category: "Testing",
          baseUnit: "piece",
          purchaseUnit: "piece",
          packFactor: 1,
          reorderPoint: 0,
          targetStock: 1,
        },
      ]),
    ).rejects.toThrow("permission");
    await expect(
      s.importVendors(a("buyer"), [
        {
          name: "Duplicate one",
          email: "duplicate@atlas.example",
          countries: "EG",
          currencies: "EGP",
        },
        {
          name: "Duplicate two",
          email: "DUPLICATE@atlas.example",
          countries: "EG",
          currencies: "EGP",
        },
      ]),
    ).rejects.toThrow("duplicate supplier email");
    expect(
      await db.vendor.count({
        where: {
          tenantId: admin.tenantId,
          email: "duplicate@atlas.example",
        },
      }),
    ).toBe(0);
    await expect(
      s.importVendors(a("buyer"), [
        {
          name: "Would be rolled back",
          email: "atomic-import@atlas.example",
          countries: "EG",
          currencies: "EGP",
        },
        {
          name: "Existing supplier",
          email: "csv-vendor@atlas.example",
          countries: "EG",
          currencies: "EGP",
        },
      ]),
    ).rejects.toBeDefined();
    expect(
      await db.vendor.count({
        where: {
          tenantId: admin.tenantId,
          email: "atomic-import@atlas.example",
        },
      }),
    ).toBe(0);
  });
  it("isolates vendor quotations and orders; vendors cannot access internal comparison", async () => {
    const { q, s } = await libs();
    const w = await q.workspace(a("vendor-1", []));
    expect(w.quotes!.every((x) => x.vendorId === "vendor-1")).toBe(true);
    expect(w.orders.every((x) => x.vendorId === "vendor-1")).toBe(true);
    expect("audits" in w).toBe(false);
    await expect(s.comparison(a("vendor-1", []), w.rfqs[0].id)).rejects.toThrow(
      "Internal workspace only",
    );
  });
  it("denies cross-entity access and auditor mutations", async () => {
    const { s } = await libs();
    await expect(
      s.createRequisition(a("buyer", ["entity-gb"]), { entityId: "entity-eg" }),
    ).rejects.toBeDefined();
    const r = await draft();
    await expect(s.submitRequisition(a("auditor"), r.id)).rejects.toThrow(
      "permission",
    );
  });
  it("blocks self-approval and requires reapproval after material changes", async () => {
    const { s, db } = await libs();
    const r = await draft();
    await s.submitRequisition(a("requester"), r.id);
    const ap = await db.approval.findFirstOrThrow({
      where: { targetId: r.id },
    });
    await expect(
      s.decideApproval({ ...a("approver"), id: "user-requester" }, ap.id, {
        decision: "APPROVED",
        reason: "Self approve",
      }),
    ).rejects.toThrow("Self-approval");
    await s.decideApproval(a("approver"), ap.id, {
      decision: "APPROVED",
      reason: "Within approved budget",
    });
    const revised = await s.reviseRequisition(a("requester"), r.id, {
      justification: "Changed requirements",
      lines: [{ productId: "product-1", quantity: 25, estimatedUnitPrice: 12 }],
    });
    expect(revised.status).toBe("DRAFT");
    expect(revised.version).toBe(2);
    await expect(
      s.createRfq(a("buyer"), {
        requisitionId: r.id,
        title: "Invalid until reapproved",
        deadline: new Date(Date.now() + 86400000).toISOString(),
      }),
    ).rejects.toThrow("must be approved");
  });
  it("normalizes packs, tax recovery and currency with decimal-safe calculations", async () => {
    const { m } = await libs();
    const l = {
      offeredQuantity: "10",
      packFactor: "5",
      unitPrice: "50",
      discountPercent: "10",
      taxPercent: "14",
      taxRecoverable: true,
      moq: "1",
      compliant: true,
    };
    const calc = m.calculateLine(l, "20");
    expect(calc.baseUnitPrice.toString()).toBe("9");
    expect(calc.net.toString()).toBe("180");
    expect(calc.payable.toString()).toBe("205.2");
    expect(calc.evaluation.toString()).toBe("180");
    const total = m.totals([{ line: l, quantity: "20" }], "5", "1", "2.5");
    expect(total.evaluation.toString()).toBe("465");
    expect(m.calculateLine(l, "21").eligible).toBe(false);
    expect(() => m.calculateLine({ ...l, packFactor: "0" }, "20")).toThrow(
      "positive",
    );
  });
  it("demonstrates cheapest unit price is not lowest delivered cost", async () => {
    const { s, db } = await libs();
    const r = await db.rfq.findFirstOrThrow({ where: { status: "AWARDED" } });
    const c = await s.comparison(a("buyer"), r.id);
    const cheap = c.offers.find((x) => x.vendorId === "vendor-1")!,
      best = c.offers.find((x) => x.vendorId === "vendor-2")!;
    expect(Number(cheap.lines[0].baseUnitPrice)).toBeLessThan(
      Number(best.lines[0].baseUnitPrice),
    );
    expect(Number(cheap.evaluation)).toBeGreaterThan(Number(best.evaluation));
    expect(c.offers[0].vendorId).toBe("vendor-2");
  });
  it("posts an idempotent partial receipt exactly once under concurrent retries", async () => {
    const { s, db } = await libs();
    const po = await db.purchaseOrder.findFirstOrThrow({
      where: { vendorId: "vendor-2" },
      include: { lines: true },
    });
    const before = await db.stockMovement.count({ where: { type: "RECEIPT" } });
    const input = {
      lines: [
        {
          purchaseOrderLineId: po.lines[0].id,
          accepted: 5,
          rejected: 0,
          reason: "Concurrent duplicate posting test",
        },
      ],
    };
    const results = await Promise.all([
      s.receiveOnce(a("warehouse"), po.id, input, "test-receipt-duplicate"),
      s.receiveOnce(a("warehouse"), po.id, input, "test-receipt-duplicate"),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(await db.stockMovement.count({ where: { type: "RECEIPT" } })).toBe(
      before + 1,
    );
    expect(
      (
        await db.purchaseOrderLine.findUniqueOrThrow({
          where: { id: po.lines[0].id },
        })
      ).received.toString(),
    ).toBe("35");
  });
  it("rejects over-receiving and maintains nonnegative reservations", async () => {
    const { s, db } = await libs();
    const po = await db.purchaseOrder.findFirstOrThrow({
      where: { vendorId: "vendor-2" },
      include: { lines: true },
    });
    await expect(
      s.receiveOnce(
        a("warehouse"),
        po.id,
        {
          lines: [
            {
              purchaseOrderLineId: po.lines[0].id,
              accepted: 999,
              rejected: 0,
              reason: "Too much",
            },
          ],
        },
        "test-receipt-excess",
      ),
    ).rejects.toThrow("outstanding");
    await expect(
      s.moveStock(a("warehouse"), {
        entityId: "entity-eg",
        warehouseId: "wh-entity-eg",
        productId: "product-1",
        type: "ISSUE",
        quantity: 9999,
        reason: "Insufficient test",
      }),
    ).rejects.toThrow("Insufficient");
  });
  it("detects duplicate invoices and refuses payment on exceptions", async () => {
    const { s, db } = await libs();
    const inv = await db.invoice.findFirstOrThrow({
      where: { number: "DEMO-EXCEPTION-002" },
      include: { lines: true },
    });
    await expect(
      s.recordPayment(a("finance"), inv.id, {
        amount: 1,
        reference: "invalid-payment",
        source: "MANUAL_BANK_CONFIRMATION",
        paidAt: new Date().toISOString(),
      }),
    ).rejects.toThrow("Only matched");
    await expect(
      s.createInvoice(a("finance"), inv.purchaseOrderId, {
        number: "demo-exception-002",
        dueAt: new Date().toISOString(),
        freight: 0,
        otherCharges: 0,
        lines: inv.lines.map((l) => ({
          purchaseOrderLineId: l.purchaseOrderLineId,
          quantity: 1,
          unitPrice: 12,
        })),
      }),
    ).rejects.toBeDefined();
  });
  it("audit, stock ledger and quotation versions are immutable at database level", async () => {
    const { db } = await libs();
    const audit = await db.audit.findFirstOrThrow();
    await expect(
      db.audit.update({ where: { id: audit.id }, data: { reason: "tamper" } }),
    ).rejects.toThrow("append-only");
    const movement = await db.stockMovement.findFirstOrThrow();
    await expect(
      db.stockMovement.delete({ where: { id: movement.id } }),
    ).rejects.toThrow("append-only");
    const quote = await db.quote.findFirstOrThrow();
    await expect(
      db.quote.update({ where: { id: quote.id }, data: { freight: 0 } }),
    ).rejects.toThrow("append-only");
  });
  it("runs requisition → approval → RFQ → vendor → award → PO → receipt → invoice → payment", async () => {
    const { s, db, q } = await libs();
    const r = await draft();
    await s.submitRequisition(a("requester"), r.id);
    let ap = await db.approval.findFirstOrThrow({ where: { targetId: r.id } });
    await s.decideApproval(a("approver"), ap.id, {
      decision: "APPROVED",
      reason: "E2E request approved",
    });
    const rfq = await s.createRfq(a("buyer"), {
      requisitionId: r.id,
      title: "End-to-end test sourcing",
      deadline: new Date(Date.now() + 86400000).toISOString(),
      sealed: false,
    });
    await s.inviteRfq(a("buyer"), rfq.id, { vendorIds: ["vendor-4"] });
    const w = await q.workspace(a("vendor-4", []));
    expect(w.rfqs.some((x) => x.id === rfq.id)).toBe(true);
    const quoteInput = {
      currency: "EGP",
      fxRate: 1,
      fxSource: "Entity base currency",
      fxAt: new Date().toISOString(),
      freight: 5,
      otherCharges: 0,
      paymentTerms: "Net 30",
      validUntil: new Date(Date.now() + 86400000).toISOString(),
      leadDays: 2,
      lines: [
        {
          rfqLineId: rfq.lines[0].id,
          offeredQuantity: 4,
          packFactor: 5,
          unitPrice: 50,
          taxPercent: 0,
          moq: 1,
          compliant: true,
        },
      ],
    };
    const quote = await s.submitQuote(a("vendor-4", []), rfq.id, quoteInput);
    await s.openRfq(a("buyer"), rfq.id);
    await expect(
      s.proposeAward(a("buyer"), rfq.id, {
        reason: "Over award test",
        lines: [{ quoteLineId: quote.lines[0].id, quantity: 25 }],
      }),
    ).rejects.toThrow("exceeds availability");
    const award = await s.proposeAward(a("buyer"), rfq.id, {
      reason: "Lowest compliant delivered price",
      lines: [{ quoteLineId: quote.lines[0].id, quantity: 20 }],
    });
    ap = await db.approval.findFirstOrThrow({ where: { targetId: award.id } });
    await s.decideApproval(a("approver"), ap.id, {
      decision: "APPROVED",
      reason: "E2E award approved",
    });
    const po = await db.purchaseOrder.findFirstOrThrow({
      where: { awardId: award.id },
      include: { lines: true },
    });
    expect(po.total.toString()).toBe("205");
    await s.acknowledgeOrder(a("vendor-4", []), po.id);
    await s.receiveOnce(
      a("warehouse"),
      po.id,
      {
        lines: [
          {
            purchaseOrderLineId: po.lines[0].id,
            accepted: 10,
            rejected: 0,
            reason: "First partial delivery",
          },
        ],
      },
      "e2e-partial-receipt",
    );
    const invoice = await s.createInvoice(a("finance"), po.id, {
      number: "E2E-MATCHED-001",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      freight: 5,
      otherCharges: 0,
      lines: [
        { purchaseOrderLineId: po.lines[0].id, quantity: 10, unitPrice: 10 },
      ],
    });
    expect(invoice.status).toBe("MATCHED");
    expect(invoice.total.toString()).toBe("105");
    await s.recordPayment(a("finance"), invoice.id, {
      amount: 105,
      reference: "E2E-BANK-REFERENCE",
      source: "MANUAL_BANK_CONFIRMATION",
      paidAt: new Date().toISOString(),
    });
    expect(
      (await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }))
        .status,
    ).toBe("PAID");
    const budget = await db.budget.findUniqueOrThrow({
      where: { id: "budget-entity-eg" },
    });
    const allPo = await db.purchaseOrder.aggregate({
      where: { budgetId: budget.id },
      _sum: { baseTotal: true },
    });
    expect(Number(budget.committed) + Number(budget.actual)).toBeCloseTo(
      Number(allPo._sum.baseTotal),
      6,
    );
  });
  it("hides sealed bids, rejects late quotes and rejects unauthorized portal rates", async () => {
    const { s, db, q } = await libs();
    const r = await draft();
    await s.submitRequisition(a("requester"), r.id);
    const ap = await db.approval.findFirstOrThrow({
      where: { targetId: r.id },
    });
    await s.decideApproval(a("approver"), ap.id, {
      decision: "APPROVED",
      reason: "Sealed test",
    });
    const rfq = await s.createRfq(a("buyer"), {
      requisitionId: r.id,
      title: "Sealed RFQ",
      deadline: new Date(Date.now() + 86400000).toISOString(),
      sealed: true,
    });
    await s.inviteRfq(a("buyer"), rfq.id, { vendorIds: ["vendor-1"] });
    const input = {
      currency: "EGP",
      fxRate: 1,
      fxSource: "Base",
      fxAt: new Date().toISOString(),
      freight: 0,
      otherCharges: 0,
      paymentTerms: "Net 30",
      validUntil: new Date(Date.now() + 86400000).toISOString(),
      leadDays: 1,
      lines: [
        {
          rfqLineId: rfq.lines[0].id,
          offeredQuantity: 20,
          packFactor: 1,
          unitPrice: 10,
        },
      ],
    };
    await s.submitQuote(a("vendor-1", []), rfq.id, input);
    await expect(s.comparison(a("buyer"), rfq.id)).rejects.toThrow("Sealed");
    await expect(s.openRfq(a("buyer"), rfq.id)).rejects.toThrow("deadline");
    const workspace = await q.workspace(a("buyer"));
    expect((workspace as any).quotes).toBeUndefined();
    expect(
      (workspace as any).audits.every((x: any) => x.after === undefined),
    ).toBe(true);
    await expect(
      s.submitQuote(a("vendor-1", []), rfq.id, { ...input, fxRate: 2 }),
    ).rejects.toThrow("buyer-verified");
    await db.rfq.update({
      where: { id: rfq.id },
      data: { deadline: new Date(Date.now() - 1000) },
    });
    await expect(
      s.submitQuote(a("vendor-1", []), rfq.id, input),
    ).rejects.toThrow("Late");
    await s.openRfq(a("buyer"), rfq.id);
    expect((await s.comparison(a("buyer"), rfq.id)).offers).toHaveLength(1);
  });
});

describe("Authenticated API boundary", () => {
  const request = (
    path: string,
    body: unknown,
    origin = "http://localhost:3000",
  ) =>
    new Request("http://localhost:3000/api/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    });
  it("requires sign-in and rejects cross-origin authentication", async () => {
    cookieJar.clear();
    const route = await import("../src/app/api/[...path]/route");
    expect(
      (
        await route.GET(new Request("http://localhost:3000/api/workspace"), {
          params: Promise.resolve({ path: ["workspace"] }),
        })
      ).status,
    ).toBe(401);
    const login = await import("../src/app/api/auth/login/route");
    expect(
      (
        await login.POST(
          request(
            "auth/login",
            {
              email: "buyer@atlas.example",
              password: process.env.DEMO_PASSWORD,
            },
            "https://attacker.invalid",
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("creates hashed server-side sessions, scopes API data and revokes on logout", async () => {
    const login = await import("../src/app/api/auth/login/route");
    expect(
      (
        await login.POST(
          request("auth/login", {
            email: "vendor1@atlas.example",
            password: process.env.DEMO_PASSWORD,
          }),
        )
      ).status,
    ).toBe(200);
    const { db } = await libs();
    const { hash } = await import("../src/lib/auth");
    const token = cookieJar.get("atlas_session")!;
    expect(token).toHaveLength(64);
    const session = await db.session.findUniqueOrThrow({
      where: { id: hash(token) },
    });
    expect(session.id).not.toBe(token);
    expect(session.userId).toBe("user-vendor-1");
    const route = await import("../src/app/api/[...path]/route");
    const response = await route.GET(
      new Request("http://localhost:3000/api/workspace"),
      { params: Promise.resolve({ path: ["workspace"] }) },
    );
    const w = await response.json();
    expect(w.quotes.every((q: any) => q.vendorId === "vendor-1")).toBe(true);
    const logout = await import("../src/app/api/auth/logout/route");
    expect((await logout.POST(request("auth/logout", {}))).status).toBe(200);
    expect(
      await db.session.findUnique({ where: { id: session.id } }),
    ).toBeNull();
  });
  it("accepts a one-use vendor invitation and rejects replay", async () => {
    const { s, db } = await libs();
    const vendor = await s.createVendor(a("buyer"), {
      name: "New fictional onboarded supplier",
      email: "new-vendor@atlas.example",
      countries: ["EG"],
      currencies: ["EGP"],
    });
    await s.qualifyVendor(a("admin"), vendor.id, {
      status: "APPROVED",
      reason: "Fictional test qualification",
    });
    const inv = await s.inviteVendor(a("buyer"), vendor.id, {
      entityId: "entity-eg",
    });
    const job = await db.job.findFirstOrThrow({
      where: { type: "ONBOARDING" },
    });
    const token = new URL((job.payload as any).acceptUrl).searchParams.get(
      "invite",
    )!;
    const route = await import("../src/app/api/[...path]/route");
    const context = {
      params: Promise.resolve({ path: ["onboarding", "accept"] }),
    };
    const payload = {
      token,
      name: "Supplier operator",
      password: "Secure-Fictional-Invitation-Password",
    };
    expect(
      (await route.POST(request("onboarding/accept", payload), context)).status,
    ).toBe(200);
    expect(
      (await db.invitation.findUniqueOrThrow({ where: { id: inv.id } })).status,
    ).toBe("ACCEPTED");
    expect(
      (await route.POST(request("onboarding/accept", payload), context)).status,
    ).toBe(400);
  });
  it("rejects expired sessions without revealing workspace data", async () => {
    const login = await import("../src/app/api/auth/login/route");
    await login.POST(
      request("auth/login", {
        email: "buyer@atlas.example",
        password: process.env.DEMO_PASSWORD,
      }),
    );
    const { db } = await libs();
    const { hash } = await import("../src/lib/auth");
    await db.session.update({
      where: { id: hash(cookieJar.get("atlas_session")!) },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    const route = await import("../src/app/api/[...path]/route");
    expect(
      (
        await route.GET(new Request("http://localhost:3000/api/workspace"), {
          params: Promise.resolve({ path: ["workspace"] }),
        })
      ).status,
    ).toBe(401);
    cookieJar.clear();
  });
});
