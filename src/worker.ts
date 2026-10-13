import nodemailer from "nodemailer";
import { Prisma } from "@prisma/client";
import { db, transaction } from "./lib/db";
let running = true;
process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});
function transport() {
  const mode = process.env.EMAIL_MODE ?? "development";
  if (mode === "disabled") return null;
  if (
    mode === "smtp" &&
    (!process.env.SMTP_HOST ||
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASSWORD ||
      !process.env.EMAIL_FROM)
  )
    throw new Error(
      "Production SMTP requires explicit host, credentials and sender",
    );
  return nodemailer.createTransport({
    host: mode === "development" ? "mailpit" : process.env.SMTP_HOST,
    port: Number(
      mode === "development" ? 1025 : (process.env.SMTP_PORT ?? 587),
    ),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      mode === "smtp"
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    requireTLS: mode === "smtp" && process.env.SMTP_SECURE !== "true",
  });
}
export async function tick() {
  const job = await transaction(async (tx) => {
    const jobs = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "Job" WHERE ("status"='PENDING' AND "availableAt"<=NOW()) OR ("status"='RUNNING' AND "lockedAt"<NOW()-INTERVAL '5 minutes') ORDER BY "availableAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!jobs[0]) return null;
    return tx.job.update({
      where: { id: jobs[0].id },
      data: {
        status: "RUNNING",
        lockedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  });
  if (!job) return false;
  try {
    const t = transport();
    if (!t) throw new Error("Email disabled: job not delivered");
    const payload = job.payload as Record<string, string>;
    if (!payload.email) throw new Error("Missing recipient");
    const subject =
      job.type === "ONBOARDING"
        ? "Invitation to Atlas supplier portal"
        : job.type.replaceAll("_", " ") +
          " · " +
          (payload.reference ?? "Atlas");
    await t.sendMail({
      from: process.env.EMAIL_FROM ?? "Atlas Development <dev@atlas.invalid>",
      to: payload.email,
      subject,
      text: [
        subject,
        payload.title,
        payload.reason,
        payload.acceptUrl ??
          (process.env.APP_URL ?? "http://localhost:3000") + "/",
        payload.deadline ? "Deadline: " + payload.deadline : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      messageId: "<" + job.id + "@atlas.local>",
    });
    await transaction(async (tx) => {
      await tx.job.update({
        where: { id: job.id },
        data: { status: "DELIVERED", deliveredAt: new Date(), lastError: null },
      });
      const inv = (job.payload as Record<string, string>).invitationId;
      if (inv)
        await tx.invitation.updateMany({
          where: { id: inv, status: "QUEUED" },
          data: { status: "DELIVERED" },
        });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Job failed";
    await db.job.update({
      where: { id: job.id },
      data: {
        status: job.attempts >= 5 ? "FAILED" : "PENDING",
        lastError: message,
        availableAt: new Date(
          Date.now() + Math.min(3600, 2 ** job.attempts * 30) * 1000,
        ),
      },
    });
    console.error(
      JSON.stringify({
        event: "job_failure",
        id: job.id,
        attempts: job.attempts,
        message,
      }),
    );
  }
  return true;
}
export async function schedule() {
  const now = new Date(),
    tomorrow = new Date(Date.now() + 86400000),
    day = now.toISOString().slice(0, 10);
  const rfqs = await db.rfq.findMany({
    where: { status: "OPEN", deadline: { gte: now, lte: tomorrow } },
    include: { vendors: true },
  });
  for (const r of rfqs)
    for (const rv of r.vendors.filter((v) => v.status !== "RESPONDED")) {
      const v = await db.vendor.findUnique({ where: { id: rv.vendorId } });
      if (!v) continue;
      const key = "reminder-" + r.id + "-" + v.id + "-" + day;
      try {
        await transaction(async (tx) => {
          if (
            await tx.idempotency.findUnique({
              where: { tenantId_key: { tenantId: r.tenantId, key } },
            })
          )
            return;
          await tx.job.create({
            data: {
              tenantId: r.tenantId,
              entityId: r.entityId,
              type: "RFQ_REMINDER",
              payload: {
                email: v.email,
                reference: r.reference,
                deadline: r.deadline.toISOString(),
              },
            },
          });
          await tx.idempotency.create({
            data: {
              tenantId: r.tenantId,
              key,
              actorId: "worker",
              operation: "REMINDER",
              result: { queued: true },
            },
          });
        });
      } catch (e) {
        if (
          !(
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === "P2002"
          )
        )
          throw e;
      }
    }
  await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.rateLimit.deleteMany({ where: { resetAt: { lt: now } } });
}
async function main() {
  console.log(
    JSON.stringify({
      event: "worker_started",
      mode: process.env.EMAIL_MODE ?? "development",
    }),
  );
  let scheduled = 0;
  while (running) {
    if (Date.now() - scheduled > 60000) {
      await schedule();
      scheduled = Date.now();
    }
    const processed = await tick();
    if (!processed) await new Promise((r) => setTimeout(r, 2000));
  }
  await db.$disconnect();
}
if (process.argv[1]?.endsWith("worker.ts"))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
