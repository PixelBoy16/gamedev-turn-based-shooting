import { GameConfig, Reward, validateConfig } from '../src/core/config';
import { FashionDef, renameFashion } from '../src/core/gear';
import { Db } from './db';

// Published game configs, one row per version in the database. The newest is the one
// new matches use. Version 0 is the seed file from the repo (config/game.json), used
// until an admin publishes anything. All versions are small, so they are kept in memory.

export interface ConfigVersion {
  version: number;
  at: string; // ISO time
  by: string;
  note: string;
}

interface Stored extends ConfigVersion {
  config: GameConfig;
}

/**
 * A version published before the wardrobe went tough names the old pieces: each renamed
 * piece becomes the seed's new one, keeping the price the admin set; rewards follow.
 */
export function renameConfig(config: GameConfig, seed: GameConfig): GameConfig {
  const fashion = config.fashion.map((f): FashionDef => {
    const id = renameFashion(f.slot, f.id);
    if (id === f.id) return f;
    const next = seed.fashion.find((s) => s.slot === f.slot && s.id === id);
    return next ? { ...next, price: f.price } : { ...f, id };
  });
  const item = (key: string) => {
    const m = /^fashion:(\w+)\/(\w+)$/.exec(key);
    return m ? `fashion:${m[1]}/${renameFashion(m[1] as FashionDef['slot'], m[2])}` : key;
  };
  const reward = (r: Reward) => ('item' in r ? { item: item(r.item) } : r);
  const tiers = config.season.tiers.map((t) => ({
    ...(t.free && { free: reward(t.free) }),
    ...(t.premium && { premium: reward(t.premium) }),
  }));
  return { ...config, fashion, season: { ...config.season, tiers } };
}

export class ConfigStore {
  private constructor(private db: Db, private versions: Stored[]) {}

  static async open(db: Db, seed: GameConfig): Promise<ConfigStore> {
    const rows = await db.query<{ version: number; at: Date | string; by_name: string; note: string; config: GameConfig }>(
      'select * from config_versions order by version');
    const versions: Stored[] = [];
    for (const r of rows) {
      // a section added to the game after this version was published comes from the seed
      r.config = renameConfig({ ...seed, ...r.config }, seed);
      if (validateConfig(r.config).errors.length) {
        console.error(`config store: v${r.version} no longer passes the checks, skipped`);
        continue;
      }
      versions.push({ version: r.version, at: new Date(r.at).toISOString(), by: r.by_name, note: r.note, config: r.config });
    }
    if (!versions.length) versions.push({ version: 0, at: new Date().toISOString(), by: 'repo', note: 'config/game.json', config: seed });
    return new ConfigStore(db, versions);
  }

  get latest(): Stored {
    return this.versions[this.versions.length - 1];
  }

  list(): ConfigVersion[] {
    return this.versions.map(({ config: _config, ...meta }) => meta).reverse();
  }

  get(version: number): GameConfig | null {
    return this.versions.find((v) => v.version === version)?.config ?? null;
  }

  /** Save a new version (the caller has validated it). */
  async publish(config: GameConfig, by: string, note: string): Promise<ConfigVersion> {
    const version = this.latest.version + 1;
    const rows = await this.db.query<{ at: Date | string }>(
      'insert into config_versions (version, by_name, note, config) values ($1, $2, $3, $4) returning at',
      [version, by, note, JSON.stringify(config)]);
    this.versions.push({ version, at: new Date(rows[0].at).toISOString(), by, note, config });
    return this.list()[0];
  }
}
