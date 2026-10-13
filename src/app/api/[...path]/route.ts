import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db, transaction } from "@/lib/db";
import {
  DomainError,
  hash,
  limit,
  requireActor,
  verifyOrigin,
} from "@/lib/auth";
import * as s from "@/lib/services";
import { workspace, orderDocument } from "@/lib/queries";
import { upload, download } from "@/lib/storage";
type Context = { params: Promise<{ path: string[] }> };
function failure(e: unknown) {
  if (e instanceof DomainError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError)
    return NextResponse.json(
      {
        error: "Validation failed",
        details: e.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
    return NextResponse.json(
      { error: "Duplicate record or already posted operation" },
      { status: 409 },
    );
  console.error(
    JSON.stringify({
      level: "error",
      event: "api_failure",
      error: e instanceof Error ? e.message : "unknown",
    }),
  );
  return NextResponse.json(
    { error: "Request failed. Contact your administrator." },
    { status: 500 },
  );
}
export async function GET(req: Request, ctx: Context) {
  try {
    const { path: p } = await ctx.params;
    if (p[0] === "health") {
      await db.$queryRaw`SELECT 1`;
      return NextResponse.json({ status: "ok" });
    }
    const a = await requireActor();
    if (p[0] === "workspace") return NextResponse.json(await workspace(a));
    if (p[0] === "rfqs" && p[2] === "comparison")
      return NextResponse.json(await s.comparison(a, p[1]));
    if (p[0] === "orders" && p[2] === "document")
      return NextResponse.json(await orderDocument(a, p[1]));
    if (p[0] === "documents" && p[2] === "download")
      return NextResponse.json(await download(a, p[1]));
    return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    verifyOrigin(req);
    if (Number(req.headers.get("content-length") ?? 0) > 1024 * 1024)
      throw new DomainError("Request too large", 413);
    const { path: p } = await ctx.params;
    const b = await req.json();
    if (p[0] === "onboarding" && p[1] === "accept") {
      const data = z
        .object({
          token: z.string().length(64),
          name: z.string().min(2).max(100),
          password: z.string().min(14).max(200),
        })
        .parse(b);
      await limit("invite:" + hash(data.token), 10);
      const passwordHash = await bcrypt.hash(data.password, 12);
      const result = await transaction(async (tx) => {
        const inv = await tx.invitation.findUnique({
          where: { tokenHash: hash(data.token) },
        });
        if (!inv || inv.acceptedAt || inv.expiresAt < new Date())
          throw new DomainError("Invitation is invalid or expired");
        const user = await tx.user.create({
          data: {
            tenantId: inv.tenantId,
            vendorId: inv.vendorId,
            email: inv.email,
            name: data.name,
            passwordHash,
            role: "VENDOR_ADMIN",
          },
        });
        await tx.invitation.update({
          where: { id: inv.id },
          data: { status: "ACCEPTED", acceptedAt: new Date() },
        });
        await tx.audit.create({
          data: {
            tenantId: inv.tenantId,
            entityId: inv.entityId,
            actorId: user.id,
            action: "ACCEPT_INVITATION",
            targetType: "Vendor",
            targetId: inv.vendorId,
            reason: "Vendor account registered",
          },
        });
        return { ok: true, email: inv.email };
      });
      return NextResponse.json(result);
    }
    const a = await requireActor();
    await limit("mutations:" + a.id, 200);
    let result: unknown;
    if (p[0] === "requisitions" && p.length === 1)
      result = await s.createRequisition(a, b);
    else if (p[0] === "requisitions" && p[2] === "submit")
      result = await s.submitRequisition(a, p[1]);
    else if (p[0] === "requisitions" && p[2] === "revise")
      result = await s.reviseRequisition(a, p[1], b);
    else if (p[0] === "approvals" && p[2] === "decide")
      result = await s.decideApproval(a, p[1], b);
    else if (p[0] === "rfqs" && p.length === 1)
      result = await s.createRfq(a, b);
    else if (p[0] === "rfqs" && p[2] === "invite")
      result = await s.inviteRfq(a, p[1], b);
    else if (p[0] === "rfqs" && p[2] === "amend")
      result = await s.amendRfq(a, p[1], b);
    else if (p[0] === "rfqs" && p[2] === "acknowledge")
      result = await s.acknowledgeRfq(a, p[1]);
    else if (p[0] === "rfqs" && p[2] === "quotes")
      result = await s.submitQuote(a, p[1], b);
    else if (p[0] === "rfqs" && p[2] === "open")
      result = await s.openRfq(a, p[1]);
    else if (p[0] === "rfqs" && p[2] === "award")
      result = await s.proposeAward(a, p[1], b);
    else if (p[0] === "orders" && p[2] === "acknowledge")
      result = await s.acknowledgeOrder(a, p[1]);
    else if (p[0] === "orders" && p[2] === "receive")
      result = await s.receiveOnce(
        a,
        p[1],
        b,
        req.headers.get("Idempotency-Key") ?? "",
      );
    else if (p[0] === "orders" && p[2] === "invoices")
      result = await s.createInvoice(a, p[1], b);
    else if (p[0] === "invoices" && p[2] === "payments")
      result = await s.recordPayment(a, p[1], b);
    else if (p[0] === "stock") result = await s.moveStock(a, b);
    else if (p[0] === "vendors" && p.length === 1)
      result = await s.createVendor(a, b);
    else if (p[0] === "vendors" && p[2] === "qualify")
      result = await s.qualifyVendor(a, p[1], b);
    else if (p[0] === "vendors" && p[2] === "invite")
      result = await s.inviteVendor(a, p[1], b);
    else if (p[0] === "master-data" && p[1] === "departments")
      result = await s.createDepartment(a, b);
    else if (p[0] === "master-data" && p[1] === "warehouses")
      result = await s.createWarehouse(a, b);
    else if (p[0] === "master-data" && p[1] === "budgets")
      result = await s.createBudget(a, b);
    else if (p[0] === "master-data" && p[1] === "products")
      result = await s.createProduct(a, b);
    else if (p[0] === "supplier-items") result = await s.supplierMapping(a, b);
    else if (p[0] === "documents" && p[1] === "upload")
      result = await upload(a, b);
    else throw new DomainError("Endpoint not found", 404);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
