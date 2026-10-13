import bcrypt from "bcryptjs";
import { db, transaction } from "../src/lib/db";
async function main() {
  const email = process.env.RESET_EMAIL,
    password = process.env.RESET_PASSWORD;
  if (!email || !password || password.length < 18)
    throw new Error("Set RESET_EMAIL and RESET_PASSWORD (18+ characters).");
  const passwordHash = await bcrypt.hash(password, 12);
  await transaction(async (tx) => {
    const u = await tx.user.findUniqueOrThrow({
      where: { email: email.toLowerCase() },
    });
    await tx.user.update({ where: { id: u.id }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: u.id } });
    await tx.audit.create({
      data: {
        tenantId: u.tenantId,
        actorId: "trusted-operator",
        action: "RESET_PASSWORD",
        targetType: "User",
        targetId: u.id,
        reason: "Password rotated by trusted operator; active sessions revoked",
      },
    });
  });
  console.log("Password updated and sessions revoked.");
}
main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e.message);
    await db.$disconnect();
    process.exit(1);
  });
