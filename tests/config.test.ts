import { afterEach, describe, expect, it } from 'vitest';
import { BUNDLED, EQUIPMENT, GameConfig, TUNING, WEAPONS, applyConfig, currentConfig, validateConfig } from '../src/core/config';
import { DEFAULT_LOADOUT, tankStats } from '../src/core/gear';

const edit = (f: (c: GameConfig) => void): GameConfig => {
  const c = structuredClone(BUNDLED);
  f(c);
  return c;
};

describe('game config', () => {
  afterEach(() => applyConfig(BUNDLED));

  it('ships a config with no errors or warnings', () => {
    expect(validateConfig(BUNDLED)).toEqual({ errors: [], warnings: [] });
  });

  it('names what is wrong in a broken config', () => {
    const { errors } = validateConfig(edit((c) => {
      (c.weapons.cannon as { damage: unknown }).damage = 'lots';
      c.rules.turnSeconds = 1;
      c.equipment = c.equipment.filter((e) => !(e.slot === 'ring' && e.id === 'none'));
      c.fashion = c.fashion.filter((f) => f.id !== 'tee');
      (c.rules as unknown as Record<string, number>).gravityy = 400;
    }));
    expect(errors).toEqual(expect.arrayContaining([
      'weapons.cannon.damage: ต้องเป็นตัวเลข',
      'rules.turnSeconds: 1 อยู่นอกช่วง 5–120',
      'equipment: ช่อง ring ต้องมี id "none" (ไม่ใส่)',
      'fashion: ต้องมี cloth "tee" (ชุดเริ่มต้น)',
      'rules.gravityy: ไม่รู้จักชื่อนี้',
    ]));
  });

  it('warns about an equipment piece that gives more than it costs', () => {
    const { errors, warnings } = validateConfig(edit((c) => {
      c.equipment.find((e) => e.id === 'heart')!.stats = { hp: 100, atk: -5 };
    }));
    expect(errors).toEqual([]);
    expect(warnings).toEqual(['equipment[1] (heart): ได้กับเสียไม่เท่ากัน (+1 แต้ม)']);
  });

  it('applies new numbers in place, so imported objects see them', () => {
    const cannon = WEAPONS.cannon;
    applyConfig(edit((c) => {
      c.weapons.cannon.damage = 999;
      delete c.weapons.splitter.speedMul;
      c.rules.maxHp = 1500;
      c.equipment.push({ id: 'moon', slot: 'charm', name: 'เครื่องรางจันทร์', stats: { hp: 50, move: -15 }, color: ['#ffffff', '#336699'] });
    }));
    expect(cannon.damage).toBe(999);
    expect(TUNING.maxHp).toBe(1500);
    expect(tankStats(DEFAULT_LOADOUT).maxHp).toBe(1500);
    expect(EQUIPMENT.find((e) => e.id === 'moon')!.color).toEqual([0xffffff, 0x336699]);
    expect(currentConfig().weapons.cannon.damage).toBe(999);
  });
});
