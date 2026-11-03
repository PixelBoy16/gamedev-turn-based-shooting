import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { Terrain } from '../src/core/Terrain';
import { TUNING, World, createTank, createWorld, explode, isSettled, stepTank, tankCentre, walk } from '../src/core/World';
import { TurnManager } from '../src/core/TurnManager';
import { ShotPlanner, chooseShot, scoreImpacts, simulateShot } from '../src/core/BotAI';
import { VolleyEvent, fireVolley, stepVolley, volleyDone } from '../src/core/Shot';
import { LIMITS, MAIN_WEAPONS, WEAPONS, WeaponDef } from '../src/core/data';
import { DEFAULT_LOADOUT, EQUIPMENT, FASHION, STAT_POINT, Stats, cleanLoadout, copyLoadout, lookId, tankStats } from '../src/core/gear';
import { freshMods, useItem, useSkill } from '../src/core/Actions';
import { MAP_IDS, generateMap, spawnX } from '../src/core/Maps';

const CANNON = WEAPONS.cannon;

function flatWorld(wind = 0): World {
  const terrain = Terrain.flat(2000, 800, 600);
  const world = createWorld(terrain, [
    createTank(0, 'P1', 0, false, 300, terrain),
    createTank(1, 'Bot', 1, true, 1500, terrain),
  ]);
  world.wind = wind;
  return world;
}

/** Fire from tank 0 and run the volley to completion. */
function fire(world: World, angle: number, power: number, weapon: WeaponDef = CANNON, noWind = false) {
  const shooter = world.tanks[0];
  shooter.angle = angle;
  shooter.facing = 1;
  const v = fireVolley(shooter, weapon, power, noWind);
  const events: VolleyEvent[] = [];
  for (let f = 0; f < 3000 && !volleyDone(v); f++) events.push(...stepVolley(world, v));
  if (!volleyDone(v)) throw new Error('never landed');
  return { v, events, impacts: events.filter((e) => e.kind === 'impact') as Extract<VolleyEvent, { kind: 'impact' }>[] };
}

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(42), b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('Terrain', () => {
  it('carves a circular hole and records the change', () => {
    const t = Terrain.flat(200, 200, 100);
    t.carve(100, 110, 20);
    expect(t.isSolid(100, 110)).toBe(false);
    expect(t.isSolid(100, 140)).toBe(true);
    expect(t.surfaceY(100)).toBe(131);
    expect(t.changes).toEqual([{ kind: 'carve', x: 100, y: 110, r: 20 }]);
  });

  it('standY skips a cave ceiling', () => {
    const t = Terrain.flat(100, 300, 200);
    t.fillColumn(50, 0, 40);
    expect(t.surfaceY(50)).toBe(0);
    expect(t.standY(50)).toBe(200);
  });
});

describe('Maps', () => {
  for (const id of MAP_IDS) {
    it(`${id}: every spawn has ground under it, and generation is deterministic`, () => {
      const a = generateMap(id, createRng(5));
      const b = generateMap(id, createRng(5));
      expect(sameBytes(a.mask, b.mask)).toBe(true);
      for (const team of [0, 1]) for (const slot of [0, 1]) expect(a.standY(spawnX(id, team, slot))).not.toBeNull();
    });

    it(`${id}: every main weapon can reach the far spawn in any wind`, () => {
      for (const weapon of MAIN_WEAPONS.map((w) => WEAPONS[w])) for (const wind of [-5, 0, 5]) {
        const terrain = generateMap(id, createRng(11));
        const world = createWorld(terrain, [
          createTank(0, 'P', 0, false, spawnX(id, 0, 0), terrain),
          createTank(1, 'B', 1, true, spawnX(id, 1, 0), terrain),
        ]);
        world.wind = wind;
        const planner = new ShotPlanner(world, world.tanks[1], createRng(3), { weapon }, 320);
        planner.work(320);
        expect(planner.bestScore).toBeGreaterThan(1000);
      }
    });
  }

  it('islands have a void you can fall into', () => {
    const t = generateMap('islands', createRng(5));
    expect(t.standY(1060)).toBeNull();
  });

  it('mine has a ceiling over the middle', () => {
    const t = generateMap('mine', createRng(5));
    expect(t.isSolid(1280, 10)).toBe(true);
  });
});

describe('weapons', () => {
  it('cannon lands and is deterministic', () => {
    const a = fire(flatWorld(), 45, 50).impacts[0];
    const b = fire(flatWorld(), 45, 50).impacts[0];
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
  });

  it('tail wind carries the shell further; calm skill cancels it', () => {
    const calm = fire(flatWorld(0), 45, 50).impacts[0];
    const tail = fire(flatWorld(5), 45, 50).impacts[0];
    const noWind = fire(flatWorld(5), 45, 50, CANNON, true).impacts[0];
    expect(tail.x).toBeGreaterThan(calm.x + 50);
    expect(noWind.x).toBeCloseTo(calm.x, 5);
  });

  it('hammer drops shorter and drifts less in wind', () => {
    const cannon = fire(flatWorld(0), 45, 60).impacts[0];
    const hammer = fire(flatWorld(0), 45, 60, WEAPONS.hammer).impacts[0];
    expect(hammer.x).toBeLessThan(cannon.x);
    const drift = (w: WeaponDef) => fire(flatWorld(5), 45, 60, w).impacts[0].x - fire(flatWorld(0), 45, 60, w).impacts[0].x;
    expect(drift(WEAPONS.hammer)).toBeLessThan(drift(CANNON));
  });

  it('split rocket bursts into 3 shells that land apart', () => {
    const { events, impacts } = fire(flatWorld(), 50, 70, WEAPONS.splitter);
    expect(events.filter((e) => e.kind === 'split')).toHaveLength(1);
    expect(impacts).toHaveLength(3);
    const xs = impacts.map((i) => i.x).sort((a, b) => a - b);
    expect(xs[2] - xs[0]).toBeGreaterThan(80);
  });

  it('drill bores a tunnel before exploding, and ignores wind', () => {
    const { events, impacts } = fire(flatWorld(), 30, 60, WEAPONS.drill);
    const carves = events.filter((e) => e.kind === 'carve');
    expect(carves.length).toBeGreaterThan(20);
    expect(impacts[0].y).toBeGreaterThan(640); // well below the 600 surface
    const windy = fire(flatWorld(5), 30, 60, WEAPONS.drill).impacts[0];
    expect(windy.x).toBeCloseTo(impacts[0].x, 5);
  });

  it('does not tunnel through a 3px wall at full power', () => {
    const world = flatWorld();
    for (let y = 0; y < 600; y++) for (let x = 700; x < 703; x++) world.terrain.mask[y * 2000 + x] = 1;
    const hit = fire(world, 10, 100).impacts[0];
    expect(hit.x).toBeLessThan(705);
  });
});

describe('explosions and tanks', () => {
  it('direct hit deals full damage, far tank is untouched', () => {
    const world = flatWorld();
    const [a, b] = world.tanks;
    const c = tankCentre(b);
    const res = explode(world, c.x, c.y, CANNON);
    expect(b.hp).toBe(TUNING.maxHp - CANNON.damage);
    expect(a.hp).toBe(TUNING.maxHp);
    expect(res.damaged).toHaveLength(1);
  });

  it('armor halves damage; burrowed takes none', () => {
    const world = flatWorld();
    const [a, b] = world.tanks;
    b.armored = true;
    a.burrowed = true;
    explode(world, tankCentre(b).x, tankCentre(b).y, CANNON);
    explode(world, tankCentre(a).x, tankCentre(a).y, CANNON);
    expect(b.hp).toBe(TUNING.maxHp - CANNON.damage / 2);
    expect(a.hp).toBe(TUNING.maxHp);
  });

  it('tank falls into the crater under it and settles', () => {
    const world = flatWorld();
    const b = world.tanks[1];
    explode(world, b.x, b.y + 10, CANNON);
    expect(isSettled(world)).toBe(false);
    for (let i = 0; i < 600 && !isSettled(world); i++) world.tanks.forEach((t) => stepTank(world, t));
    expect(isSettled(world)).toBe(true);
    expect(b.y).toBeGreaterThan(600);
  });

  it('walking climbs small steps and is blocked by tall walls', () => {
    const world = flatWorld();
    const a = world.tanks[0];
    for (let y = 595; y < 600; y++) for (let x = 305; x < 400; x++) world.terrain.mask[y * 2000 + x] = 1;
    for (let i = 0; i < 20; i++) walk(world, a, 1);
    expect(a.y).toBe(595);
    for (let y = 555; y < 595; y++) for (let x = 340; x < 345; x++) world.terrain.mask[y * 2000 + x] = 1;
    for (let i = 0; i < 200; i++) walk(world, a, 1);
    expect(a.x).toBeLessThan(341);
  });

  it('rising water drowns a tank', () => {
    const world = flatWorld();
    world.waterY = 560;
    stepTank(world, world.tanks[0]);
    expect(world.tanks[0].alive).toBe(false);
  });
});

describe('items and skills', () => {
  it('one item per turn; used items are gone', () => {
    const world = flatWorld();
    const a = world.tanks[0];
    a.items = ['double', 'heal', 'armor'];
    a.hp = 500;
    const mods = freshMods();
    expect(useItem(a, 1, mods)).toBe('heal');
    expect(a.hp).toBe(750);
    expect(useItem(a, 0, mods)).toBeNull();
    expect(a.items).toEqual(['double', null, 'armor']);
    const next = freshMods();
    useItem(a, 0, next);
    expect(next.shots).toBe(2);
    expect(next.dmgScale).toBeCloseTo(0.6);
  });

  it('the hammer\'s wall blocks a flat shot; skill then cools down for 3 own turns', () => {
    const world = flatWorld();
    const a = world.tanks[0];
    a.loadout = { ...a.loadout, weapon: 'hammer' };
    a.facing = 1;
    const mods = freshMods();
    const res = useSkill(world, a, mods);
    expect(res?.wall).toBeDefined();
    expect(fire(world, 5, 80).impacts[0].x).toBeLessThan(a.x + 60);
    const tm = new TurnManager(world, createRng(1));
    const cds: number[] = [];
    for (let i = 0; i < 6; i++) {
      const t = tm.next();
      if (t === a) cds.push(a.skillCooldown);
    }
    expect(cds).toEqual([2, 1, 0]);
  });
});

describe('gear', () => {
  it('every equipment piece is a sidegrade: gains and costs cancel out', () => {
    for (const g of EQUIPMENT) {
      const points = (Object.keys(g.stats) as (keyof Stats)[]).reduce((p, k) => p + g.stats[k]! / STAT_POINT[k], 0);
      expect(points, g.id).toBeCloseTo(0);
    }
  });

  it('fashion only changes the look, never the stats', () => {
    for (const f of FASHION) {
      const l = copyLoadout(DEFAULT_LOADOUT);
      l.look[f.slot] = f.id;
      expect(tankStats(l), f.id).toEqual(tankStats(DEFAULT_LOADOUT));
      if (f.id !== DEFAULT_LOADOUT.look[f.slot]) expect(lookId(l)).not.toBe(lookId(DEFAULT_LOADOUT));
    }
  });

  it('gear changes HP, damage dealt and taken, and walking fuel', () => {
    const terrain = Terrain.flat(2000, 800, 600);
    const tough = createTank(0, 'A', 0, false, 300, terrain, {
      ...DEFAULT_LOADOUT, equip: { ...DEFAULT_LOADOUT.equip, bracelet: 'iron', ring: 'stone' },
    });
    expect(tough.maxHp).toBe(TUNING.maxHp + 100);
    expect(tough.hp).toBe(tough.maxHp);
    expect(tough.def).toBeCloseTo(0.95);
    const plain = createTank(1, 'B', 1, false, 1500, terrain);
    const world = createWorld(terrain, [tough, plain]);
    explode(world, tankCentre(tough).x, tankCentre(tough).y, CANNON);
    explode(world, tankCentre(plain).x, tankCentre(plain).y, CANNON);
    expect(tough.maxHp - tough.hp).toBe(Math.round(CANNON.damage * 0.95));
    expect(plain.maxHp - plain.hp).toBe(CANNON.damage);
    const tm = new TurnManager(world, createRng(1));
    tm.next();
    expect(tm.fuel).toBeCloseTo(TUNING.fuelPerTurn * 0.7); // iron bracelet −15% and stone ring −15%
  });

  it('cleans unknown or misplaced ids from saves and the network', () => {
    const dirty = { weapon: 'drill', look: { hat: 'tee', cloth: 'robe' }, equip: { ring: 'ruby', charm: 'nope' }, hide: { hat: 1 } };
    expect(cleanLoadout(dirty)).toEqual({
      weapon: 'cannon',
      look: { ...DEFAULT_LOADOUT.look, cloth: 'trench' },
      equip: { ...DEFAULT_LOADOUT.equip, ring: 'ruby' },
      hide: { hat: true, glasses: false },
    });
    expect(cleanLoadout(undefined)).toEqual(DEFAULT_LOADOUT);
  });

  it('each main weapon has its own skill; storm splits the rocket into 5', () => {
    expect(new Set(MAIN_WEAPONS.map((w) => WEAPONS[w].skill)).size).toBe(MAIN_WEAPONS.length);
    const world = flatWorld();
    const a = world.tanks[0];
    a.loadout = { ...a.loadout, weapon: 'splitter' };
    const mods = freshMods();
    expect(useSkill(world, a, mods)?.skill).toBe('storm');
    a.angle = 60;
    a.facing = 1;
    const v = fireVolley(a, WEAPONS.splitter, 70, false, mods.splitCount);
    for (let f = 0; f < 3000 && !volleyDone(v); f++) stepVolley(world, v);
    expect(v.shells).toHaveLength(LIMITS.stormSplit);
    expect(tankStats(a.loadout).maxHp).toBe(TUNING.maxHp);
  });
});

describe('TurnManager', () => {
  it('alternates teams, rolls wind and reports a winner', () => {
    const world = flatWorld();
    const tm = new TurnManager(world, createRng(3));
    expect(tm.next().id).toBe(0);
    expect(tm.next().id).toBe(1);
    expect(Math.abs(world.wind)).toBeLessThanOrEqual(TUNING.maxWind);
    expect(tm.winner()).toBeNull();
    world.tanks[1].hp = 0;
    expect(tm.winner()).toBe(0);
  });

  it('1v2 alternates teams and rotates the bigger team', () => {
    const world = flatWorld();
    world.tanks.push(createTank(2, 'Bot2', 1, true, 1700, world.terrain));
    const tm = new TurnManager(world, createRng(3));
    expect([1, 2, 3, 4, 5, 6].map(() => tm.next().id)).toEqual([0, 1, 0, 2, 0, 1]);
  });

  it('sudden death raises the water every turn after turn 30', () => {
    const world = flatWorld();
    const tm = new TurnManager(world, createRng(3));
    for (let i = 0; i < TUNING.suddenDeathTurn; i++) tm.next();
    expect(world.waterY).toBe(Infinity);
    tm.next();
    expect(world.waterY).toBe(800 - TUNING.waterRisePerTurn);
  });
});

describe('BotAI', () => {
  it('hard bot lands within two blast radii on open ground, even in wind', () => {
    for (const wind of [-4, 0, 4]) {
      const world = flatWorld(wind);
      const [player, bot] = world.tanks;
      const shot = chooseShot(world, bot, createRng(7), 'hard', { weapon: CANNON });
      const hit = simulateShot(world, bot, shot, { weapon: CANNON })[0];
      expect(hit).toBeDefined();
      expect(Math.abs(hit.x - player.x)).toBeLessThan(CANNON.radius * 2);
    }
  });

  it('plans a damaging split-rocket shot and does not touch the terrain', () => {
    const world = flatWorld(2);
    const before = world.terrain.mask.slice();
    const planner = new ShotPlanner(world, world.tanks[1], createRng(9), { weapon: WEAPONS.splitter });
    while (!planner.work(40));
    expect(planner.bestScore).toBeGreaterThan(1000);
    expect(sameBytes(world.terrain.mask, before)).toBe(true);
  });

  it('scores self-damage below a clean miss', () => {
    const world = flatWorld();
    const bot = world.tanks[1];
    const self = scoreImpacts(world, bot, [tankCentre(bot)], { weapon: CANNON });
    const miss = scoreImpacts(world, bot, [{ x: 900, y: 600 }], { weapon: CANNON });
    expect(self).toBeLessThan(miss);
  });
});

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
