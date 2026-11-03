import { TurnMods, freshMods, useItem, useSkill } from '../src/core/Actions';
import { ShotPlanner, chooseAttackItem, chooseSupport } from '../src/core/BotAI';
import { GameConfig, currentConfig, useConfig } from '../src/core/config';
import { ITEM_IDS, ItemId, LIMITS, WEAPONS } from '../src/core/data';
import { cleanLoadout, randomLoadout } from '../src/core/gear';
import { skillOf } from '../src/core/Actions';
import { MAP_IDS, generateMap } from '../src/core/Maps';
import { RosterEntry, ShotRun, buildTanks, runShot, stepTanks } from '../src/core/Match';
import { Rng } from '../src/core/rng';
import { encodeMask, terrainHash } from '../src/core/Terrain';
import { TurnManager } from '../src/core/TurnManager';
import { TUNING, World, createWorld, tankCentre, walk } from '../src/core/World';
import {
  ClientMsg, FireMsg, MatchView, PlayerView, Profile, RoomConfig, RoomView, ServerMsg, TEAM_SIZE, TurnInfo,
} from '../src/net/protocol';

// Friend rooms: 6-digit codes, teams, host settings, and the authoritative match.
// Transport-agnostic: a Conn is anything that can send a message, so tests drive
// this directly and index.ts plugs in WebSockets.

export interface Conn {
  send(msg: ServerMsg): void;
}

/** Real-time delays (ms). Tests shrink these. */
export const TIMING = {
  turnGrace: 2000, // extra time after the turn clock, for a shot released at 0
  settleWait: 12000, // max wait for every client to finish animating a shot
  botThink: 900,
  botAction: 400,
  botWalkTick: 100,
  emptyRoom: 120000, // a room with nobody connected is closed after this
};

const SAMPLES = { easy: 120, normal: 220, hard: 320 };

interface Player extends Profile {
  id: number;
  team: number;
  token: string;
  conn: Conn | null;
  /** In the battle screen (not the lobby), so the server waits for their animations. */
  inMatch: boolean;
}

// The server runs every match on one set of global game numbers (src/core/config).
// A match keeps the config it started with, so an admin publishing new numbers never
// changes a match in progress: each entry point below re-applies the config it runs
// under (useConfig is a no-op when it is already live). New matches and the lobby use
// the latest published one.
let published: GameConfig = currentConfig();

/** New matches (and the lobby) use `config` from now on. */
export function setPublished(config: GameConfig): void {
  published = config;
}

export class Lobby {
  readonly rooms = new Map<string, Room>();
  private seats = new Map<Conn, { room: Room; player: Player }>();

  constructor(private rng: Rng = Math.random) {}

  handle(conn: Conn, msg: ClientMsg): void {
    useConfig(published); // a match's own handler switches to its config
    const seat = this.seats.get(conn);
    switch (msg.t) {
      case 'create': {
        if (seat) this.leave(conn);
        const room = new Room(this.newCode(), this.rng, (r) => this.rooms.delete(r.code));
        this.rooms.set(room.code, room);
        this.sit(conn, room, room.add(cleanProfile(msg), conn)!);
        return;
      }
      case 'join': {
        if (seat) this.leave(conn);
        const room = this.rooms.get(String(msg.code).trim());
        if (!room) return conn.send({ t: 'error', msg: 'ไม่พบห้องนี้' });
        if (room.match) return conn.send({ t: 'error', msg: 'ห้องนี้กำลังเล่นอยู่' });
        const p = room.add(cleanProfile(msg), conn);
        if (!p) return conn.send({ t: 'error', msg: 'ห้องเต็มแล้ว' });
        this.sit(conn, room, p);
        return;
      }
      case 'rejoin': {
        const room = this.rooms.get(msg.code);
        const p = room?.players.find((q) => q.token === msg.token);
        if (!room || !p) return conn.send({ t: 'left' });
        if (p.conn && p.conn !== conn) this.seats.delete(p.conn);
        p.conn = conn;
        this.sit(conn, room, p);
        if (room.match) room.match.sendView(p);
        return;
      }
      case 'leave':
        this.leave(conn);
        conn.send({ t: 'left' });
        return;
    }
    if (seat) seat.room.handle(seat.player, msg);
  }

  disconnect(conn: Conn): void {
    const seat = this.seats.get(conn);
    if (!seat) return;
    this.seats.delete(conn);
    if (seat.player.conn !== conn) return; // already moved to a newer connection
    seat.player.conn = null;
    seat.player.inMatch = false;
    seat.room.changed();
  }

  private sit(conn: Conn, room: Room, p: Player): void {
    this.seats.set(conn, { room, player: p });
    p.conn = conn;
    conn.send({ t: 'joined', code: room.code, token: p.token, you: p.id, game: published });
    room.changed();
  }

  private leave(conn: Conn): void {
    const seat = this.seats.get(conn);
    if (!seat) return;
    this.seats.delete(conn);
    seat.room.remove(seat.player);
  }

  private newCode(): string {
    for (;;) {
      const code = String(Math.floor(this.rng() * 900000) + 100000);
      if (!this.rooms.has(code)) return code;
    }
  }
}

function cleanProfile(p: Partial<Profile>): Profile {
  const name = String(p.name ?? '').trim().slice(0, 12) || 'ผู้เล่น';
  const loadout = cleanLoadout(p.loadout);
  const items = Array.isArray(p.items) ? [...new Set(p.items.filter((i) => ITEM_IDS.includes(i)))] : [];
  return { name, loadout, items: items.length === LIMITS.itemsPerMatch ? items : ['double', 'heal', 'armor'] };
}

function token(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export class Room {
  players: Player[] = [];
  hostId = -1;
  config: RoomConfig = { map: 'hills', format: '1v1', difficulty: 'normal' };
  match: ServerMatch | null = null;
  private nextId = 0;
  private emptyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly code: string, private rng: Rng, private onClose: (r: Room) => void) {}

  get capacity(): number {
    return TEAM_SIZE[this.config.format];
  }

  add(profile: Profile, conn: Conn): Player | null {
    const counts = [0, 1].map((team) => this.players.filter((p) => p.team === team).length);
    const team = counts[0] <= counts[1] ? 0 : 1;
    if (counts[team] >= this.capacity) return null;
    const p: Player = { ...profile, id: this.nextId++, team, token: token(), conn, inMatch: false };
    this.players.push(p);
    if (this.hostId < 0) this.hostId = p.id;
    return p;
  }

  remove(p: Player): void {
    this.players = this.players.filter((q) => q !== p);
    this.match?.abandon(p);
    if (this.hostId === p.id) this.hostId = this.players[0]?.id ?? -1;
    if (this.players.length === 0) this.close();
    else this.changed();
  }

  handle(p: Player, msg: ClientMsg): void {
    const host = p.id === this.hostId;
    switch (msg.t) {
      case 'profile':
        if (this.match) return;
        Object.assign(p, cleanProfile(msg));
        return this.changed();
      case 'team': {
        const team = msg.team === 1 ? 1 : 0;
        if (this.match || team === p.team) return;
        if (this.players.filter((q) => q.team === team).length >= this.capacity) return this.error(p, 'ทีมนั้นเต็มแล้ว');
        p.team = team;
        return this.changed();
      }
      case 'config': {
        if (!host || this.match) return;
        const c = msg.config;
        const format = c.format === '2v2' ? '2v2' : '1v1';
        const per = TEAM_SIZE[format];
        if ([0, 1].some((team) => this.players.filter((q) => q.team === team).length > per)) {
          return this.error(p, 'คนในห้องเกินสำหรับ 1v1');
        }
        this.config = {
          map: MAP_IDS.includes(c.map) ? c.map : 'hills',
          format,
          difficulty: (['easy', 'normal', 'hard'] as const).includes(c.difficulty) ? c.difficulty : 'normal',
        };
        return this.changed();
      }
      case 'start':
        if (!host || this.match) return;
        this.match = new ServerMatch(this, this.rng);
        this.changed();
        this.match.begin();
        return;
      case 'resume':
        this.match?.sendView(p);
        return;
      case 'away':
        p.inMatch = false;
        this.match?.checkSettled();
        return;
      default:
        this.match?.handle(p, msg);
    }
  }

  view(): RoomView {
    const players: PlayerView[] = this.players.map(({ id, name, loadout, items, team, conn }) => ({
      id, name, loadout, items, team, connected: !!conn,
    }));
    return { code: this.code, hostId: this.hostId, config: { ...this.config }, players, playing: !!this.match };
  }

  /** Re-broadcast the lobby view, and close the room if nobody is connected for a while. */
  changed(): void {
    this.broadcast({ t: 'room', room: this.view() });
    const anyone = this.players.some((p) => p.conn);
    if (anyone && this.emptyTimer) {
      clearTimeout(this.emptyTimer);
      this.emptyTimer = null;
    } else if (!anyone && !this.emptyTimer) {
      this.emptyTimer = setTimeout(() => this.close(), TIMING.emptyRoom);
    }
    this.match?.checkSettled();
  }

  broadcast(msg: ServerMsg, except?: Player): void {
    for (const p of this.players) if (p !== except) p.conn?.send(msg);
  }

  matchEnded(): void {
    this.match = null;
    this.changed();
  }

  private error(p: Player, msg: string): void {
    p.conn?.send({ t: 'error', msg });
  }

  private close(): void {
    this.match?.stop();
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
    this.onClose(this);
  }
}

/** The authoritative match: same core rules as the client, plus the clock, wind and bots. */
export class ServerMatch {
  readonly world: World;
  readonly turns: TurnManager;
  readonly config: RoomConfig;
  /** tank id → player id, or null for a bot (including a seat whose player left). */
  readonly owner: (number | null)[];
  phase: 'aim' | 'resolving' | 'over' = 'aim';
  private mods: TurnMods = freshMods();
  private turnStartX = 0;
  private turnId = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private settled = new Set<number>();
  private missStreak = new Map<number, number>();
  /** The game numbers this match started with and keeps to the end. */
  readonly game = published;

  constructor(private room: Room, private rng: Rng) {
    this.use();
    this.config = { ...room.config };
    const terrain = generateMap(this.config.map, rng);
    const roster: RosterEntry[] = [];
    this.owner = [];
    for (const team of [0, 1]) {
      const humans = room.players.filter((p) => p.team === team);
      for (const p of humans) {
        roster.push({ name: p.name, team, isBot: false, loadout: p.loadout, items: [...p.items] });
        this.owner.push(p.id);
      }
      for (let i = humans.length; i < TEAM_SIZE[this.config.format]; i++) {
        roster.push({ name: `บอท ${roster.filter((r) => r.isBot).length + 1}`, team, isBot: true, loadout: randomLoadout(this.rng), items: this.botItems() });
        this.owner.push(null);
      }
    }
    this.world = createWorld(terrain, buildTanks(this.config.map, terrain, roster));
    this.turns = new TurnManager(this.world, rng);
  }

  /** Switch the global game numbers to this match's. */
  private use(): void {
    useConfig(this.game);
  }

  begin(): void {
    this.use();
    // The first turn travels inside each player's match view.
    this.nextTurn(false);
    for (const p of this.room.players) this.sendView(p);
  }

  stop(): void {
    this.phase = 'over';
    this.turnId++;
    if (this.timer) clearTimeout(this.timer);
  }

  sendView(p: Player): void {
    p.inMatch = true;
    const view: MatchView = {
      config: this.config,
      game: this.game,
      tanks: this.world.tanks,
      terrain: encodeMask(this.world.terrain),
      turn: this.turnInfo(),
      you: this.owner.indexOf(p.id),
    };
    p.conn?.send({ t: 'match', match: view });
  }

  /** A player left the room mid-match: a bot takes over their tank. */
  abandon(p: Player): void {
    this.use();
    const id = this.owner.indexOf(p.id);
    if (id < 0) return;
    this.owner[id] = null;
    this.world.tanks[id].isBot = true;
    if (this.phase === 'aim' && this.turns.current === id) void this.runBot(this.turnId);
    this.checkSettled();
  }

  handle(p: Player, msg: ClientMsg): void {
    this.use();
    switch (msg.t) {
      case 'settled':
        if (msg.turn === this.turns.turnNumber) this.settled.add(p.id);
        return this.checkSettled();
      case 'needTerrain':
        p.conn?.send({ t: 'terrain', terrain: encodeMask(this.world.terrain) });
        return;
    }
    // Everything below is the active player acting on their turn.
    const t = this.turns.active;
    if (this.phase !== 'aim' || this.owner[t.id] !== p.id) return;
    switch (msg.t) {
      case 'move':
        if (!this.validMove(msg)) return;
        Object.assign(t, { x: msg.x, y: msg.y, facing: msg.facing, angle: msg.angle });
        this.room.broadcast({ t: 'move', id: t.id, ...pickMove(msg) }, p);
        return;
      case 'item':
        if (useItem(t, msg.slot, this.mods)) this.room.broadcast({ t: 'item', id: t.id, slot: msg.slot });
        return;
      case 'skill': {
        const res = useSkill(this.world, t, this.mods);
        if (!res) return;
        this.room.broadcast({ t: 'skill', id: t.id });
        if (res.endsTurn) this.resolve();
        return;
      }
      case 'fire':
        if (!this.validMove(msg) || (msg.drill && t.drillLeft <= 0)) return;
        this.fire({ ...pickMove(msg), drill: !!msg.drill });
    }
  }

  /** Everyone still watching has finished animating the shot: on to the next turn. */
  checkSettled(): void {
    this.use();
    if (this.phase !== 'resolving') return;
    const waiting = this.room.players.filter((p) => p.conn && p.inMatch && !this.settled.has(p.id));
    if (waiting.length === 0) this.advance();
  }

  private validMove(m: FireMsg | Omit<FireMsg, 'drill'>): boolean {
    return [m.x, m.y, m.angle, m.power].every(Number.isFinite)
      && Math.abs(m.x - this.turnStartX) <= TUNING.fuelPerTurn * this.turns.active.move + 4
      && m.y >= 0 && m.y <= this.world.terrain.height + 100
      && (m.facing === 1 || m.facing === -1);
  }

  private fire(shot: FireMsg): void {
    const t = this.turns.active;
    shot.angle = Math.max(0, Math.min(90, Math.round(shot.angle)));
    shot.power = Math.max(0, Math.min(100, Math.round(shot.power)));
    Object.assign(t, { x: shot.x, y: shot.y, facing: shot.facing, angle: shot.angle });
    const weapon = shot.drill ? WEAPONS.drill : WEAPONS[t.loadout.weapon];
    if (shot.drill) t.drillLeft--;
    this.room.broadcast({ t: 'shot', id: t.id, ...shot });
    const run = new ShotRun(this.world, t, weapon, shot.power, this.mods);
    runShot(run);
    if (t.isBot) this.missStreak.set(t.id, run.damage > 0 ? 0 : (this.missStreak.get(t.id) ?? 0) + 1);
    this.resolve();
  }

  private resolve(): void {
    this.phase = 'resolving';
    this.turnId++; // cancels a bot still thinking
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.advance(), TIMING.settleWait);
    this.checkSettled();
  }

  private advance(): void {
    this.use();
    if (this.phase !== 'resolving') return;
    if (this.timer) clearTimeout(this.timer);
    const winner = this.turns.winner();
    if (winner !== null) {
      this.phase = 'over';
      this.room.broadcast({ t: 'over', winner, tanks: this.world.tanks });
      this.room.matchEnded();
      return;
    }
    this.nextTurn();
  }

  private nextTurn(announce = true): void {
    const t = this.turns.next();
    this.mods = freshMods();
    this.turnStartX = t.x;
    this.settled.clear();
    this.phase = 'aim';
    const id = ++this.turnId;
    if (announce) this.room.broadcast({ t: 'turn', turn: this.turnInfo(), tanks: this.world.tanks, hash: terrainHash(this.world.terrain) });
    this.timer = setTimeout(() => {
      this.use();
      if (this.phase === 'aim' && this.turnId === id) this.resolve(); // nobody fired in time
    }, TUNING.turnSeconds * 1000 + TIMING.turnGrace);
    if (this.owner[t.id] === null) void this.runBot(id);
  }

  private turnInfo(): TurnInfo {
    const w = this.world;
    return {
      active: this.turns.current,
      turnNumber: this.turns.turnNumber,
      wind: w.wind,
      waterY: Number.isFinite(w.waterY) ? w.waterY : null,
      timeLeft: TUNING.turnSeconds,
    };
  }

  /** Same decisions as the offline bot, paced in real time so players can watch. */
  private async runBot(id: number): Promise<void> {
    // after every await another match may have switched the numbers: re-apply before acting
    const stale = () => {
      this.use();
      return this.turnId !== id || this.phase !== 'aim';
    };
    const bot = this.turns.active;
    const difficulty = this.config.difficulty;
    await sleep(TIMING.botThink);
    if (stale()) return;
    for (const a of chooseSupport(this.world, bot, skillOf(bot), difficulty)) {
      if (a.kind === 'item') {
        if (useItem(bot, a.slot, this.mods)) this.room.broadcast({ t: 'item', id: bot.id, slot: a.slot });
      } else {
        const res = useSkill(this.world, bot, this.mods);
        if (!res) continue;
        this.room.broadcast({ t: 'skill', id: bot.id });
        if (res.endsTurn) return this.resolve();
      }
      await sleep(TIMING.botAction);
      if (stale()) return;
    }
    const opts = () => ({
      weapon: WEAPONS[bot.loadout.weapon], noWind: this.mods.noWind, dmgScale: this.mods.dmgScale * bot.atk, splitCount: this.mods.splitCount,
    });
    let planner = new ShotPlanner(this.world, bot, this.rng, opts(), SAMPLES[difficulty]);
    planner.work(SAMPLES[difficulty]);
    if (planner.bestScore < 1000) {
      // Nothing damaging from here: walk toward the nearest enemy once, then replan.
      const bc = tankCentre(bot);
      const nearest = this.world.tanks
        .filter((t) => t.alive && t.team !== bot.team)
        .sort((a, b) => Math.abs(a.x - bc.x) - Math.abs(b.x - bc.x))[0];
      const dir = nearest && nearest.x < bot.x ? -1 : 1;
      let left = 120;
      while (left > 0) {
        let moved = 0;
        for (let i = 0; i < 6; i++) {
          moved += walk(this.world, bot, dir);
          stepTanks(this.world);
        }
        left -= moved;
        this.room.broadcast({ t: 'move', id: bot.id, x: bot.x, y: bot.y, facing: bot.facing, angle: bot.angle, power: 0 });
        await sleep(TIMING.botWalkTick);
        if (stale()) return;
        if (moved === 0) break;
      }
      planner = new ShotPlanner(this.world, bot, this.rng, opts(), SAMPLES[difficulty]);
      planner.work(SAMPLES[difficulty]);
    }
    const attack = chooseAttackItem(bot, planner.bestScore > 1000, difficulty);
    if (attack && attack.kind === 'item' && useItem(bot, attack.slot, this.mods)) {
      this.room.broadcast({ t: 'item', id: bot.id, slot: attack.slot });
    }
    const shot = planner.result(difficulty, this.missStreak.get(bot.id) ?? 0);
    this.fire({ x: bot.x, y: bot.y, facing: shot.facing, angle: shot.angle, power: shot.power, drill: false });
  }

  private botItems(): ItemId[] {
    const pool = [...ITEM_IDS];
    return Array.from({ length: LIMITS.itemsPerMatch }, () => pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
  }
}

function pickMove(m: Omit<FireMsg, 'drill'>) {
  return { x: m.x, y: m.y, facing: m.facing, angle: m.angle, power: m.power };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

