// Administration CLI for a trusted operator; secrets are read only from environment.
// Usage: PROVISION_FILE=/absolute/path/to/config.json npm run admin:provision
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, transaction } from "../src/lib/db";
const record = z.object({
  tenantId: z.string(),
  entityId: z.string(),
  operatorId: z.string(),
  departments: z
    .array(z.object({ name: z.string().min(1), costCenter: z.string().min(1) }))
    .default([]),
  warehouses: z
    .array(z.object({ name: z.string().min(1), location: z.string().min(1) }))
    .default([]),
  users: z
    .array(
      z.object({
        name: z.string().min(1),
        email: z.email(),
        role: z.enum([
          "ENTITY_ADMIN",
          "BUYER",
          "REQUESTER",
          "APPROVER",
          "WAREHOUSE",
          "FINANCE",
          "AUDITOR",
        ]),
      }),
    )
    .default([]),
  products: z
    .array(
      z.object({
        sku: z.string().min(1),
        name: z.string().min(1),
        category: z.string().min(1),
        baseUnit: z.string().min(1).default("piece"),
        purchaseUnit: z.string().default("piece"),
        packFactor: z.number().positive().default(1),
        kind: z.enum(["GOODS", "SERVICE"]).default("GOODS"),
        reorderPoint: z.number().nonnegative().default(10),
        targetStock: z.number().positive().default(100),
      }),
    )
    .default([]),
});
async function main() {
  if (!process.env.PROVISION_FILE) throw new Error("PROVISION_FILE required");
  const data = record.parse(
    JSON.parse(readFileSync(process.env.PROVISION_FILE, "utf8")),
  );
  const password = process.env.PROVISION_PASSWORD;
  if (data.users.length && (!password || password.length < 18))
    throw new Error(
      "PROVISION_PASSWORD of at least 18 characters required; users should use unique passwords provisioned separately",
    );
  const passwordHash = password ? await bcrypt.hash(password, 12) : "";
  await transaction(async (tx) => {
    const operator = await tx.user.findFirst({
      where: {
        id: data.operatorId,
        tenantId: data.tenantId,
        active: true,
        role: "GROUP_ADMIN",
      },
    });
    if (!operator)
      throw new Error("Valid group administrator operatorId required");
    const entity = await tx.entity.findFirst({
      where: { id: data.entityId, tenantId: data.tenantId },
    });
    if (!entity) throw new Error("Entity not found");
    for (const d of data.departments)
      await tx.department.create({
        data: { ...d, tenantId: data.tenantId, entityId: data.entityId },
      });
    for (const w of data.warehouses)
      await tx.warehouse.create({
        data: { ...w, tenantId: data.tenantId, entityId: data.entityId },
      });
    for (const u of data.users)
      await tx.user.create({
        data: {
          ...u,
          email: u.email.toLowerCase(),
          tenantId: data.tenantId,
          passwordHash,
          memberships: { create: { entityId: data.entityId } },
        },
      });
    for (const p of data.products)
      await tx.product.create({
        data: {
          ...p,
          tenantId: data.tenantId,
          stockTracked: p.kind === "GOODS",
        },
      });
    await tx.audit.create({
      data: {
        tenantId: data.tenantId,
        entityId: data.entityId,
        actorId: data.operatorId,
        action: "PROVISION",
        targetType: "Entity",
        targetId: data.entityId,
        reason: "Trusted operator provisioned master data",
        after: {
          departments: data.departments.length,
          warehouses: data.warehouses.length,
          users: data.users.length,
          products: data.products.length,
        },
      },
    });
  });
  console.log(
    "Provisioned master data. Password rotation uses scripts/password.ts.",
  );
}
main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e.message);
    await db.$disconnect();
    process.exit(1);
  });
