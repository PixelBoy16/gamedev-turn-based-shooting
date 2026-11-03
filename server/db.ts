import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

// The server's database. Production: PostgreSQL from DATABASE_URL (Neon, Supabase,
// Render...). Locally and in tests: PGlite, the same Postgres compiled to WASM,
// stored in a folder (or in memory), so nothing needs installing.

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function openDb(opts: { url?: string; dir?: string } = {}): Promise<Db> {
  let db: Db;
  if (opts.url) {
    const pool = new pg.Pool({ connectionString: opts.url, max: 5 });
    db = {
      query: async <T>(sql: string, params?: unknown[]) => (await pool.query(sql, params)).rows as T[],
      close: () => pool.end(),
    };
  } else {
    const lite = new PGlite(opts.dir);
    db = {
      query: async <T>(sql: string, params?: unknown[]) => (await lite.query<T>(sql, params)).rows,
      close: () => lite.close(),
    };
  }
  await migrate(db);
  return db;
}

/** Schema changes in order; each runs once. Append new steps, never edit old ones. */
const MIGRATIONS: string[] = [
  `create table accounts (
     id bigserial primary key,
     username text unique,               -- null until a guest picks one
     pass_hash text,
     display_name text not null,
     profile jsonb not null default '{}', -- saved loadout and items
     rating integer not null default 1000,
     played integer not null default 0,
     wins integer not null default 0,
     ranked_played integer not null default 0,
     created_at timestamptz not null default now(),
     last_seen timestamptz not null default now()
   );
   create table sessions (
     token_hash text primary key,
     account_id bigint not null references accounts(id) on delete cascade,
     created_at timestamptz not null default now(),
     last_used timestamptz not null default now()
   );
   create index sessions_account on sessions(account_id);
   create table matches (
     id bigserial primary key,
     ranked boolean not null,
     map text not null,
     format text not null,
     winner integer not null,
     players jsonb not null,
     at timestamptz not null default now()
   );
   create table config_versions (
     version integer primary key,
     at timestamptz not null default now(),
     by_name text not null,
     note text not null default '',
     config jsonb not null
   );`,
];

async function migrate(db: Db): Promise<void> {
  await db.query('create table if not exists schema_version (version integer not null)');
  const rows = await db.query<{ version: number }>('select version from schema_version');
  let at = rows[0]?.version ?? 0;
  if (!rows.length) await db.query('insert into schema_version values (0)');
  for (; at < MIGRATIONS.length; at++) {
    for (const stmt of MIGRATIONS[at].split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.query(stmt);
    await db.query('update schema_version set version = $1', [at + 1]);
  }
}
