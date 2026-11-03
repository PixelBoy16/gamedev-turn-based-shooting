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
  // shop and Battle Pass
  `alter table accounts add column coins integer not null default 0;
   alter table accounts add column gems integer not null default 0;
   create table owned (
     account_id bigint not null references accounts(id) on delete cascade,
     item text not null,                 -- "fashion:<slot>/<id>" or "equip:<slot>/<id>"
     source text not null,               -- shop, pass, admin
     at timestamptz not null default now(),
     primary key (account_id, item)
   );
   create table passes (
     account_id bigint not null references accounts(id) on delete cascade,
     season text not null,
     xp integer not null default 0,
     premium boolean not null default false,
     claimed jsonb not null default '[]',  -- ["free:3", "premium:3", ...]
     primary key (account_id, season)
   );
   create table ledger (                 -- every coin and gem in or out, for support and audits
     id bigserial primary key,
     account_id bigint not null references accounts(id) on delete cascade,
     coins integer not null default 0,
     gems integer not null default 0,
     reason text not null,
     at timestamptz not null default now()
   );
   create index ledger_account on ledger(account_id, at);`,
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
