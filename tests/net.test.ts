import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lobby, Room } from '../server/rooms';
import { generateMap } from '../src/core/Maps';
import { ShotRun, buildTanks, runShot } from '../src/core/Match';
import { createRng } from '../src/core/rng';
import { Terrain, decodeMask, encodeMask, terrainHash } from '../src/core/Terrain';
import { createWorld } from '../src/core/World';
import { freshMods } from '../src/core/Actions';
import { WEAPONS } from '../src/core/data';
import { DEFAULT_LOADOUT } from '../src/core/gear';
import { BUNDLED, applyConfig } from '../src/core/config';
import { ClientMsg, ServerMsg } from '../src/net/protocol';

class FakeConn {
  inbox: ServerMsg[] = [];
  send(m: ServerMsg): void {
    this.inbox.push(JSON.parse(JSON.stringify(m))); // what goes over the wire is JSON
  }
  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    return [...this.inbox].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined;
  }
  all<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.inbox.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
  }
}

const profile = (name: string) => ({ name, loadout: DEFAULT_LOADOUT, items: ['double', 'heal', 'armor'] as ('double' | 'heal' | 'armor')[] });

function setup() {
  const lobby = new Lobby(createRng(7));
  const a = new FakeConn();
  const b = new FakeConn();
  const send = (c: FakeConn, m: ClientMsg) => lobby.handle(c, m);
  send(a, { t: 'create', ...profile('เอ') });
  const code = a.last('joined')!.code;
  send(b, { t: 'join', code, ...profile('บี') });
  const room = lobby.rooms.get(code)!;
  return { lobby, a, b, send, code, room };
}

/** The active human fires straight up at low power: lands near themselves, harmless enough. */
function fireActive(room: Room, conns: Map<number, FakeConn>, send: (c: FakeConn, m: ClientMsg) => void) {
  const m = room.match!;
  const t = m.turns.active;
  const pid = m.owner[t.id]!;
  send(conns.get(pid)!, { t: 'fire', x: t.x, y: t.y, facing: t.facing, angle: 80, power: 20, drill: false });
  return t;
}

describe('terrain sync helpers', () => {
  it('round-trips the mask through run-length encoding', () => {
    const t = generateMap('mine', createRng(3));
    t.carve(900, 500, 60);
    const copy = new Terrain(t.width, t.height);
    decodeMask(copy, encodeMask(t));
    expect(terrainHash(copy)).toBe(terrainHash(t));
    expect(encodeMask(t).length).toBeLessThan(20000); // small enough to send whole
  });

  it('runs a shot headlessly the same way twice', () => {
    const play = () => {
      const terrain = generateMap('hills', createRng(11));
      const roster = [0, 1].map((team) => ({ name: `t${team}`, team, isBot: false, loadout: DEFAULT_LOADOUT, items: [] }));
      const world = createWorld(terrain, buildTanks('hills', terrain, roster));
      world.wind = 3;
      const s = world.tanks[0];
      s.angle = 52;
      runShot(new ShotRun(world, s, WEAPONS.cannon, 78, { ...freshMods(), shots: 2 }));
      return { hash: terrainHash(terrain), tanks: world.tanks.map((t) => [t.x, t.y, t.hp]) };
    };
    expect(play()).toEqual(play());
  });
});

describe('friend rooms', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('creates a 6-digit room and seats the second player on the other team', () => {
    const { a, b, code } = setup();
    expect(code).toMatch(/^\d{6}$/);
    const room = b.last('room')!.room;
    expect(room.players.map((p) => [p.name, p.team])).toEqual([['เอ', 0], ['บี', 1]]);
    expect(a.last('room')!.room.hostId).toBe(room.players[0].id);
  });

  it('rejects a wrong code and a full 1v1 room', () => {
    const { lobby, code } = setup();
    const c = new FakeConn();
    lobby.handle(c, { t: 'join', code: '000000', ...profile('ซี') });
    expect(c.last('error')!.msg).toBe('ไม่พบห้องนี้');
    lobby.handle(c, { t: 'join', code, ...profile('ซี') });
    expect(c.last('error')!.msg).toBe('ห้องเต็มแล้ว');
  });

  it('only the host starts; both players get the match and the first turn', () => {
    const { a, b, send } = setup();
    send(b, { t: 'start' });
    expect(b.last('match')).toBeUndefined();
    send(a, { t: 'start' });
    for (const c of [a, b]) {
      expect(c.last('match')!.match.tanks).toHaveLength(2);
      expect(c.last('match')!.match.turn.turnNumber).toBe(1);
    }
    expect(a.last('match')!.match.you).not.toBe(b.last('match')!.match.you);
  });

  it('relays a shot, waits for both to settle, then passes the turn', () => {
    const { a, b, send, room } = setup();
    send(a, { t: 'start' });
    const conns = new Map([[room.players[0].id, a], [room.players[1].id, b]]);
    const shooter = fireActive(room, conns, send);
    for (const c of [a, b]) expect(c.last('shot')).toMatchObject({ id: shooter.id, angle: 80, power: 20 });
    send(a, { t: 'settled', turn: 1 });
    expect(a.all('turn')).toHaveLength(0); // still waiting for b
    send(b, { t: 'settled', turn: 1 });
    const turn = b.last('turn')!;
    expect(turn.turn.turnNumber).toBe(2);
    expect(turn.turn.active).not.toBe(shooter.id);
    expect(turn.hash).toBe(terrainHash(room.match!.world.terrain));
  });

  it('ignores actions from the player whose turn it is not', () => {
    const { a, b, send, room } = setup();
    send(a, { t: 'start' });
    const active = room.match!.turns.active;
    const idle = room.match!.owner[active.id] === room.players[0].id ? b : a;
    const other = room.match!.world.tanks.find((t) => t !== active)!;
    send(idle, { t: 'fire', x: other.x, y: other.y, facing: 1, angle: 45, power: 50, drill: false });
    expect(a.last('shot')).toBeUndefined();
  });

  it('skips a turn when the clock runs out', async () => {
    const { a, send } = setup();
    send(a, { t: 'start' });
    await vi.advanceTimersByTimeAsync(20000 + 2000 + 12000 + 10);
    expect(a.last('turn')!.turn.turnNumber).toBe(2);
  });

  it('fills empty seats with bots that take their own turns', async () => {
    const lobby = new Lobby(createRng(5));
    const a = new FakeConn();
    lobby.handle(a, { t: 'create', ...profile('เดี่ยว') });
    lobby.handle(a, { t: 'start' });
    const room = [...lobby.rooms.values()][0];
    const m = room.match!;
    expect(m.owner.filter((o) => o === null)).toHaveLength(1);
    if (m.owner[m.turns.active.id] !== null) {
      fireActive(room, new Map([[room.players[0].id, a]]), (c, msg) => lobby.handle(c, msg));
      lobby.handle(a, { t: 'settled', turn: 1 });
    }
    const botId = m.owner.indexOf(null);
    await vi.advanceTimersByTimeAsync(5000);
    expect(a.all('shot').some((s) => s.id === botId)).toBe(true);
  });

  it('hands a leaving player\'s tank to a bot and promotes a new host', () => {
    const { a, b, send, room } = setup();
    send(a, { t: 'start' });
    const aTank = room.match!.owner.indexOf(room.players[0].id);
    send(a, { t: 'leave' });
    expect(room.match!.world.tanks[aTank].isBot).toBe(true);
    expect(b.last('room')!.room.hostId).toBe(room.players[0].id);
  });

  it('ends the match, reports the winner and reopens the room', () => {
    const { a, b, send, room } = setup();
    send(a, { t: 'start' });
    const m = room.match!;
    const shooter = m.turns.active;
    for (const t of m.world.tanks) if (t.team !== shooter.team) t.hp = 0;
    const conns = new Map([[room.players[0].id, a], [room.players[1].id, b]]);
    fireActive(room, conns, send);
    send(a, { t: 'settled', turn: 1 });
    send(b, { t: 'settled', turn: 1 });
    for (const c of [a, b]) expect(c.last('over')!.winner).toBe(shooter.team);
    expect(room.match).toBeNull();
    expect(a.last('room')!.room.playing).toBe(false);
  });

  it('lets a dropped player rejoin with their token and get the match back', () => {
    const { lobby, a, send } = setup();
    send(a, { t: 'start' });
    const { code, token } = a.last('joined')!;
    lobby.disconnect(a);
    const a2 = new FakeConn();
    lobby.handle(a2, { t: 'rejoin', code, token });
    expect(a2.last('joined')!.code).toBe(code);
    expect(a2.last('match')!.match.tanks).toHaveLength(2);
  });
});

describe('server game config', () => {
  afterEach(() => applyConfig(BUNDLED));

  it('sends its numbers with the match, and the client simulates with them', () => {
    applyConfig({ ...structuredClone(BUNDLED), rules: { ...BUNDLED.rules, maxHp: 1234 } });
    const { a, send } = setup();
    send(a, { t: 'start' });
    const view = a.last('match')!.match;
    expect(view.game.rules.maxHp).toBe(1234);
    expect(view.tanks[0].maxHp).toBe(1234);
  });
});
