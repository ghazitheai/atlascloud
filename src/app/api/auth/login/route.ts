import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  createSession,
  DomainError,
  hash,
  limit,
  verifyOrigin,
} from "@/lib/auth";
export async function POST(req: Request) {
  try {
    verifyOrigin(req);
    const body = await req.json();
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    await limit("login:" + hash(email), 10);
    const u = await db.user.findUnique({ where: { email } });
    if (
      !u ||
      !u.active ||
      !(await bcrypt.compare(String(body.password ?? ""), u.passwordHash))
    )
      throw new DomainError("Invalid email or password", 401);
    await createSession(u.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof DomainError ? e.message : "Sign-in failed" },
      { status: e instanceof DomainError ? e.status : 500 },
    );
  }
}
