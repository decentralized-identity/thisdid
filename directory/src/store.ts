/**
 * The directory's only storage: one small keyed D1 table
 * (`directory_store`, mirrored in migrations/0005_directory_store.sql).
 * The directory is deliberately D1-only — no KV involvement; the shared
 * database is the single place its sync result and score cache live.
 */
import type { Env } from "./types";

let schemaReady = false;

async function ensureStore(db: D1Database): Promise<void> {
  if (schemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS directory_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_ts INTEGER NOT NULL
      )`,
    )
    .run();
  schemaReady = true;
}

export async function storeGet(env: Env, key: string): Promise<string | null> {
  if (!env.DB) return null;
  try {
    await ensureStore(env.DB);
    const row = await env.DB.prepare(
      "SELECT value FROM directory_store WHERE key = ?",
    )
      .bind(key)
      .first<{ value: string }>();
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function storePut(
  env: Env,
  key: string,
  value: string,
  now: number,
): Promise<void> {
  if (!env.DB) return;
  await ensureStore(env.DB);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO directory_store (key, value, updated_ts) VALUES (?, ?, ?)",
  )
    .bind(key, value, now)
    .run();
}
