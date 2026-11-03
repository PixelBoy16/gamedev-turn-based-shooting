import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GameConfig, validateConfig } from '../src/core/config';

// Published game configs, one JSON file per version in <dataDir>/config/. The newest
// is the one new matches use. Version 0 is the seed file from the repo
// (config/game.json), used until an admin publishes anything.

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
  private dir: string;
  private versions: Stored[] = [];

  constructor(dataDir: string, seed: GameConfig) {
    this.dir = join(dataDir, 'config');
    mkdirSync(this.dir, { recursive: true });
    for (const f of readdirSync(this.dir)) {
      if (!/^v\d+\.json$/.test(f)) continue;
      try {
        const s = JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as Stored;
        if (validateConfig(s.config).errors.length === 0) this.versions.push(s);
        else console.error(`config store: ${f} is invalid, skipped`);
      } catch {
        console.error(`config store: ${f} is unreadable, skipped`);
      }
    }
    this.versions.sort((a, b) => a.version - b.version);
    if (!this.versions.length) this.versions.push({ version: 0, at: new Date().toISOString(), by: 'repo', note: 'config/game.json', config: seed });
  }

  get latest(): ConfigVersion & { config: GameConfig } {
    return this.versions[this.versions.length - 1];
  }

  list(): ConfigVersion[] {
    return this.versions.map(({ config: _config, ...meta }) => meta).reverse();
  }

  get(version: number): GameConfig | null {
    return this.versions.find((v) => v.version === version)?.config ?? null;
  }

  /** Save a new version (the caller has validated it). */
  publish(config: GameConfig, by: string, note: string): ConfigVersion {
    const s: Stored = { version: this.latest.version + 1, at: new Date().toISOString(), by, note, config };
    writeFileSync(join(this.dir, `v${s.version}.json`), `${JSON.stringify(s, null, 2)}\n`);
    this.versions.push(s);
    return this.list()[0];
  }
}
