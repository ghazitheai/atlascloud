import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hash, verifyOrigin, DomainError } from "@/lib/auth";
export async function POST(req: Request) {
  try {
    verifyOrigin(req);
    const jar = await cookies();
    const token = jar.get("atlas_session")?.value;
    if (token) await db.session.deleteMany({ where: { id: hash(token) } });
    jar.delete("atlas_session");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: "Request rejected" },
      { status: e instanceof DomainError ? e.status : 500 },
    );
  }
}
