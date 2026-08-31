import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";

// ponytail: one pool per process; DATABASE_URL points at docker-compose or Supabase, same code.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
