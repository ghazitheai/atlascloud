import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, transaction } from "../src/lib/db";
const input = z
  .object({
    email: z.email(),
    password: z.string().min(18),
    tenantName: z.string().min(2),
    entityName: z.string().min(2),
    country: z.string().length(2),
    currency: z.string().length(3),
  })
  .parse({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    tenantName: process.env.TENANT_NAME,
    entityName: process.env.ENTITY_NAME,
    country: process.env.ENTITY_COUNTRY,
    currency: process.env.ENTITY_CURRENCY,
  });
async function main() {
  const passwordHash = await bcrypt.hash(input.password, 12);
  await transaction(async (tx) => {
    if (await tx.tenant.count())
      throw new Error(
        "Bootstrap only supports an empty database; it never overwrites existing tenants.",
      );
    const tenant = await tx.tenant.create({ data: { name: input.tenantName } });
    const entity = await tx.entity.create({
      data: {
        tenantId: tenant.id,
        name: input.entityName,
        country: input.country,
        currency: input.currency,
        policy: {
          selfApproval: false,
          allowOverBudget: false,
          priceTolerancePercent: 0,
          recoverableTax: false,
        },
      },
    });
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: input.email.toLowerCase(),
        passwordHash,
        name: "Organization administrator",
        role: "GROUP_ADMIN",
        memberships: { create: { entityId: entity.id } },
      },
    });
    await tx.audit.create({
      data: {
        tenantId: tenant.id,
        entityId: entity.id,
        actorId: user.id,
        action: "BOOTSTRAP",
        targetType: "Tenant",
        targetId: tenant.id,
        reason: "Initial organization and administrator provisioned",
      },
    });
    console.log(
      "Organization initialized. Remove bootstrap credentials from the environment.",
    );
  });
}
main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e.message);
    await db.$disconnect();
    process.exit(1);
  });
