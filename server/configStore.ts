import { GameConfig, validateConfig } from '../src/core/config';
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

export class ConfigStore {
  private constructor(private db: Db, private versions: Stored[]) {}

  static async open(db: Db, seed: GameConfig): Promise<ConfigStore> {
    const rows = await db.query<{ version: number; at: Date | string; by_name: string; note: string; config: GameConfig }>(
      'select * from config_versions order by version');
    const versions: Stored[] = [];
    for (const r of rows) {
      // a section added to the game after this version was published comes from the seed
      r.config = { ...seed, ...r.config };
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
