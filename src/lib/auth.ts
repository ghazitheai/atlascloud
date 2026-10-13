import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
export const roles = [
  "GROUP_ADMIN",
  "ENTITY_ADMIN",
  "BUYER",
  "REQUESTER",
  "APPROVER",
  "WAREHOUSE",
  "FINANCE",
  "AUDITOR",
  "VENDOR_ADMIN",
  "VENDOR_EMPLOYEE",
] as const;
export type Actor = {
  id: string;
  tenantId: string;
  role: string;
  vendorId: string | null;
  entityIds: string[];
  name: string;
};
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function currentActor(): Promise<Actor | null> {
  const token = (await cookies()).get("atlas_session")?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hash(token) },
    include: { user: { include: { memberships: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active)
    return null;
  const u = session.user;
  return {
    id: u.id,
    tenantId: u.tenantId,
    role: u.role,
    vendorId: u.vendorId,
    entityIds: u.memberships.map((m) => m.entityId),
    name: u.name,
  };
}
export async function requireActor() {
  const a = await currentActor();
  if (!a) throw new DomainError("Please sign in", 401);
  return a;
}
export function authorize(a: Actor, allowed: string[], entityId?: string) {
  if (!allowed.includes(a.role))
    throw new DomainError("You do not have permission for this action", 403);
  if (entityId && a.role !== "GROUP_ADMIN" && !a.entityIds.includes(entityId))
    throw new DomainError("Entity access denied", 403);
}
export function scope(a: Actor) {
  return {
    tenantId: a.tenantId,
    ...(a.role === "GROUP_ADMIN" ? {} : { entityId: { in: a.entityIds } }),
  };
}
export function internal(a: Actor) {
  if (a.vendorId || a.role.startsWith("VENDOR"))
    throw new DomainError("Internal workspace only", 403);
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      id: hash(token),
      userId,
      expiresAt: new Date(Date.now() + 8 * 3600000),
    },
  });
  (await cookies()).set("atlas_session", token, {
    httpOnly: true,
    secure:
      process.env.COOKIE_SECURE === "false" &&
      process.env.APP_URL?.startsWith("http://localhost")
        ? false
        : process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 3600,
  });
}
export function verifyOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== process.env.APP_URL)
    throw new DomainError("Request origin denied", 403);
}
export async function limit(key: string, max = 30) {
  const result = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "RateLimit" ("key","count","resetAt") VALUES (${key},1,NOW()+INTERVAL '15 minutes') ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "RateLimit"."resetAt"<NOW() THEN 1 ELSE "RateLimit"."count"+1 END,"resetAt"=CASE WHEN "RateLimit"."resetAt"<NOW() THEN NOW()+INTERVAL '15 minutes' ELSE "RateLimit"."resetAt" END RETURNING "count"`;
  if (result[0].count > max)
    throw new DomainError("Too many requests. Try later.", 429);
}
