import { createClient, type Client, type InArgs } from "@libsql/client";
import path from "path";
import { initializeSchema } from "./db-schema";

/**
 * libSQL (SQLite) client in dual mode:
 *  - Local dev: no env vars -> uses the same `data/portfolio.db` file as before.
 *  - Online (Vercel): TURSO_DATABASE_URL + TURSO_AUTH_TOKEN -> remote Turso.
 *
 * libSQL's API is async, so getDb() returns a thin wrapper that mimics the
 * better-sqlite3 statement shape (prepare().get/.all/.run) but returns promises.
 * Call sites only need to add `await`.
 */

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

function rawClient(): Client {
  if (!client) {
    const url =
      process.env.TURSO_DATABASE_URL ??
      "file:" + path.join(process.cwd(), "data", "portfolio.db");
    const authToken = process.env.TURSO_AUTH_TOKEN;
    client = createClient({ url, authToken, intMode: "number" });
  }
  return client;
}

export type SqlArg = string | number | bigint | boolean | null | Uint8Array;

interface Stmt {
  get<T = Record<string, unknown>>(...args: SqlArg[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(...args: SqlArg[]): Promise<T[]>;
  run(...args: SqlArg[]): Promise<{ changes: number; lastInsertRowid: number }>;
}

export interface Db {
  prepare(sql: string): Stmt;
  /** Run several write statements atomically (replaces better-sqlite3 transactions). */
  batch(stmts: { sql: string; args?: SqlArg[] }[]): Promise<void>;
}

function makeDb(c: Client): Db {
  return {
    prepare(sql: string): Stmt {
      return {
        async get<T = Record<string, unknown>>(...args: SqlArg[]) {
          const r = await c.execute({ sql, args: args as InArgs });
          return r.rows[0] as T | undefined;
        },
        async all<T = Record<string, unknown>>(...args: SqlArg[]) {
          const r = await c.execute({ sql, args: args as InArgs });
          return r.rows as unknown as T[];
        },
        async run(...args: SqlArg[]) {
          const r = await c.execute({ sql, args: args as InArgs });
          return {
            changes: r.rowsAffected,
            lastInsertRowid:
              r.lastInsertRowid != null ? Number(r.lastInsertRowid) : 0,
          };
        },
      };
    },
    async batch(stmts) {
      if (stmts.length === 0) return;
      await c.batch(
        stmts.map((s) => ({ sql: s.sql, args: (s.args ?? []) as InArgs })),
        "write"
      );
    },
  };
}

export default async function getDb(): Promise<Db> {
  const c = rawClient();
  if (!schemaReady) {
    schemaReady = initializeSchema(c);
  }
  await schemaReady;
  return makeDb(c);
}
