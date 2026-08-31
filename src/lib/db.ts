import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";

// ponytail: one pool per process; DATABASE_URL points at docker-compose, Homebrew or Supabase, same code.
// Hosted Postgres needs TLS (Supabase's CA is not in Node's bundle, hence no verify); serverless needs a small pool
// because every Vercel instance opens its own — point DATABASE_URL at Supabase's transaction pooler (port 6543).
const url = process.env.DATABASE_URL ?? "";
const local = /localhost|127\.0\.0\.1/.test(url);
export const pool = new Pool({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false }, max: local ? 10 : 3 });

let migrated: Promise<void> | null = null;
export function migrate() {
  migrated ??= pool
    .query(fs.readFileSync(path.join(process.cwd(), "db/schema.sql"), "utf8"))
    .then(() => undefined);
  return migrated;
}

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  await migrate();
  const r = await pool.query(text, params);
  return r.rows as T[];
}
