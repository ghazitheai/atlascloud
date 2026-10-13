import { beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
// This is PostgreSQL compiled to WASM, not a SQL mock. CI additionally runs native PostgreSQL.
export let postgres: PGlite | undefined;
let prisma: PrismaClient;
let tail = Promise.resolve();
async function acquire() {
  let release!: () => void;
  const current = new Promise<void>((r) => (release = r));
  const prev = tail;
  tail = current;
  await prev;
  return release;
}
beforeAll(async () => {
  process.env.ALLOW_DEMO_SEED = "true";
  process.env.DEMO_PASSWORD = "Fictional-Test-Password-2026";
  process.env.APP_URL = "http://localhost:3000";
  const native = process.env.TEST_DATABASE_URL;
  if (native) {
    if (!new URL(native).pathname.endsWith("_test"))
      throw new Error("TEST_DATABASE_URL database name must end in _test");
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: native, max: 10 }),
    });
  } else {
    postgres = new PGlite();
    await postgres.waitReady;
    await postgres.exec(
      readFileSync("prisma/migrations/202610110001_init/migration.sql", "utf8"),
    );
    const pool = new pg.Pool();
    const rawQuery = async (config: any, values?: any[]) => {
      const sql = typeof config === "string" ? config : config.text;
      const args = values ?? config.values ?? [];
      const r = await postgres!.query<any[]>(sql, args, {
        rowMode: "array",
        parsers: {
          1700: (v: string) => v,
          1114: (v: string) => v.replace(" ", "T") + "Z",
          1184: (v: string) => new Date(v).toISOString(),
          114: (v: string) => v,
          3802: (v: string) => v,
        },
      });
      return {
        rows: r.rows,
        fields: r.fields,
        rowCount: r.affectedRows ?? r.rows.length,
      };
    };
    (pool as any).query = async (config: any, values?: any[]) => {
      const unlock = await acquire();
      try {
        return await rawQuery(config, values);
      } finally {
        unlock();
      }
    };
    (pool as any).connect = async () => {
      const unlock = await acquire();
      const conn = new EventEmitter();
      return Object.assign(conn, { query: rawQuery, release: unlock });
    };
    (pool as any).end = async () => {};
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  }
  (globalThis as any).prisma = prisma;
  const { seed } = await import("../prisma/seed");
  await seed();
}, 60000);
afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (postgres) await postgres.close();
});
