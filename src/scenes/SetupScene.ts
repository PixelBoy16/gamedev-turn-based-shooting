import Phaser from 'phaser';
import { ART_SCALE, equipTexture, gunLook, lookHand, lookRes, lookTexture, pieceTexture } from '../art/chibi';
import { ITEMS, ITEM_IDS, ItemId, LIMITS, MAIN_WEAPONS, SKILLS, WEAPONS } from '../core/data';
import {
  EQUIP_SLOTS, EQUIP_SLOT_NAME, EquipSlot, FASHION_SLOTS, FASHION_SLOT_NAME, FashionSlot, STAT_NAME, Stats,
  equipDef, equipIn, fashionDef, fashionIn, sumStats, tankStats,
} from '../core/gear';
import { MAPS, MAP_IDS, MapId } from '../core/Maps';
import { Difficulty } from '../core/BotAI';
import { FONT, confirmBox, fit, label } from '../ui/widgets';
import { Box, Chip, PlateButton, STROKE, SliceButton, SliceLook, filled, fitted, mockupBox, panel, placed, walletBar } from '../ui/plates';
import { account } from '../net/account';
import { ItemKind, enforceOwned, itemKey, owns, priceOf, priceText } from '../core/shop';
import { DIFF_LABEL, FORMAT_LABEL, Format, MatchSetup, loadSetup, saveSetup } from './setup';

const FORMATS: Format[] = ['1v1', '1v2', '2v2'];
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

/** Where each piece sits in the designer's 1672x941 mockup (new_ui/black-boom-wardrobe-parts/layout.json). */
const box = (b: Box): Box => mockupBox(b, 1672);
const W = (name: string) => `ui-wardrobe/${name}`;

// the drop's plates, nine-sliced (corner size on the exported texture)
const TAB_GOLD: SliceLook = { key: W('tab-gold'), inset: 34 };
const TAB_NAVY: SliceLook = { key: W('tab-navy'), inset: 30 };
const TAB_RED: SliceLook = { key: W('tab-red'), inset: 38 };
const ROW_ON: SliceLook = { key: W('row-selected'), inset: 18 };
const TILE: SliceLook = { key: W('tile'), inset: 22 };

const FASHION_ICON: Record<FashionSlot, string> = {
  hat: 'hat', glasses: 'glasses', hair: 'hair', face: 'face', cloth: 'clothes', eyes: 'eyes', set: 'set-box', back: 'backpack',
};
/** Item cards: plate colour and painted icon. */
const ITEM_LOOK: Record<ItemId, { card: string; icon: string }> = {
  double: { card: 'card-blue', icon: 'double-shot' },
  power: { card: 'card-orange', icon: 'power' },
  warp: { card: 'card-purple', icon: 'warp' },
  heal: { card: 'card-green', icon: 'heart' },
  armor: { card: 'card-blue', icon: 'shield' },
};
/** Stat rows: icon and bar colour (from the drop's stats/*.svg). */
const STAT_LOOK: Record<keyof Stats, { icon: string; color: number }> = {
  hp: { icon: 'heart', color: 0xff464c },
  atk: { icon: 'sword', color: 0x7cfa27 },
  def: { icon: 'ico-shield', color: 0xffc900 },
  move: { icon: 'boot', color: 0xff9200 },
};
const MAP_THUMB: Record<MapId, string> = { hills: 'map-hills', islands: 'map-islands', mine: 'map-mine' };

const text = (scene: Phaser.Scene, str: string, size: number, color = '#ffffff', stroke = 5) =>
  scene.add.text(0, 0, str, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: STROKE, strokeThickness: stroke });

/**
 * Pick character, 3 items, map, format and bot difficulty. Built to the painted mockup
 * (new_ui/black-boom-wardrobe-parts): fashion slots, the character on its stage, gear and
 * stats, the weapon; the items row; map, format and bot strength with the start button on
 * the right. Dressing for a friend room or ranked (the room decides the rest) leaves the
 * right column to a cheering fighter and the start button.
 */
export default class SetupScene extends Phaser.Scene {
  private setup!: MatchSetup;
  private refreshers: (() => void)[] = [];
  private hint!: Phaser.GameObjects.Text;
  /** Picking a character and items for a friend room: the room decides map, format and bots. */
  private online = false;
  /** Where "back"/"done" go when dressing up for a friend room or ranked (no map or bot picks). */
  private returnTo: 'lobby' | 'ranked' | null = null;
  /** The open "pick a piece" window, if any. */
  private picker: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('setup');
  }

  init(): void {
    this.setup = loadSetup(this.registry);
    this.refreshers = [];
    this.picker = [];
    const mode = this.registry.get('setupMode');
    this.returnTo = mode === 'online' ? 'lobby' : mode === 'ranked' ? 'ranked' : null;
    this.online = this.returnTo !== null;
    // a saved outfit may hold pieces this account doesn't own (bought on another account, or offline)
    if (account.view) this.setup.loadout = enforceOwned(this.setup.loadout, account.owned());
  }

  create(): void {
    const bg = this.add.image(960, 540, W('bg'));
    bg.setScale(Math.max(1920 / bg.width, 1080 / bg.height));
    filled(this, W('crate-left'), box([0, 799, 574, 142]));
    this.chrome();
    this.wardrobe();
    this.itemPicker();
    if (this.online) this.cheer();
    else this.rightColumn();
    this.startButton();
    filled(this, W('crate-right'), box([1492, 853, 180, 88]));
    this.hint = label(this, 960, 1030, '', 28, '#ffd166').setOrigin(0.5).setDepth(10);
    this.refresh();
  }

  private refresh(): void {
    for (const r of this.refreshers) r();
  }

  private start(): void {
    if (this.setup.items.length !== LIMITS.itemsPerMatch) {
      this.say(`เลือกไอเท็มให้ครบ ${LIMITS.itemsPerMatch} ชิ้นก่อนนะ`);
      return;
    }
    saveSetup(this.registry, this.setup);
    this.scene.start(this.returnTo ?? 'battle');
  }

  private back(): void {
    this.scene.start(this.returnTo ?? 'menu');
  }

  private say(msg: string): void {
    this.hint.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.hint);
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 1800, duration: 400 });
  }

  // ---------------------------------------------------------------- frame

  /** Back buttons (top and bottom), the title plate with the hanger, wallet and settings. */
  private chrome(): void {
    const back = new PlateButton(this, 'ui-ranked/btn-back', box([20, 14, 92, 76]), () => this.back());
    back.put(fitted(this, 'ui-ranked/ico-back', back.w * 0.52, back.h * 0.56), 0.5, 0.5);
    filled(this, W('header'), box([142, 14, 556, 88]));
    placed(this, W('logo'), box([138, 8, 171, 94]));
    const [dx, dy, , dh] = box([327, 30, 4, 51]);
    this.add.rectangle(dx, dy, 4, dh, 0xd5dbee, 1).setOrigin(0);
    placed(this, W('ico-hanger'), box([346, 7, 84, 85]));
    const [tx, ty, tw, th] = box([437, 16, 220, 69]);
    fit(text(this, 'ตู้เสื้อผ้า', 56, '#ffffff', 8).setOrigin(0, 0.5).setPosition(tx, ty + th / 2), tw, th);
    walletBar(this);

    const ret = new PlateButton(this, W('btn-return'), box([18, 851, 236, 82]), () => this.back(), [0, 0, 1, 1]);
    ret.put(fitted(this, 'ui-ranked/ico-back', ret.w * 0.18, ret.h * 0.48), 0.32, 0.5);
    ret.put(fit(text(this, 'กลับ', 40, '#ffffff', 6).setOrigin(0, 0.5), ret.w * 0.45, ret.h * 0.65), 0.45, 0.5);
  }

  /** A section tab: a painted plate with an icon and its title. Not a button. */
  private tab(b: Box, look: SliceLook, icon: string, title: string, size = 28): void {
    const t = new SliceButton(this, box(b), look);
    t.put(fitted(this, W(`ico-${icon}`), t.w * 0.2, t.h * 0.7), 0.195, 0.5);
    t.put(fit(text(this, title, size).setOrigin(0, 0.5), t.w * 0.63, t.h * 0.8), 0.31, 0.5);
  }

  // ---------------------------------------------------------------- wardrobe

  /**
   * Fashion slots on the left (looks only), the character on its stage in the middle,
   * equipment slots and stats (numbers only), the weapon at the right. Tapping a slot
   * opens a picker with every piece for it.
   */
  private wardrobe(): void {
    filled(this, W('panel'), box([48, 132, 1145, 469]));
    this.tab([63, 117, 155, 51], TAB_GOLD, 'shirt', 'แฟชั่น');
    this.tab([201, 118, 159, 50], TAB_NAVY, 'face', 'แค่หน้าตา');
    this.tab([629, 115, 278, 53], TAB_GOLD, 'tools', 'อุปกรณ์ · ค่าสถานะ');
    this.tab([945, 115, 151, 52], TAB_RED, 'target', 'อาวุธ');

    // the character, in the outfit being picked, on the lit stage
    filled(this, W('showcase'), box([301, 154, 350, 362]));
    const [ax, ay, aw, ah] = box([383, 236, 238, 236]);
    const feet = ay + ah;
    const cx = ax + aw / 2 - 18;
    const zoom = 3.5;
    const avatar = this.add.image(cx, feet, '__DEFAULT').setOrigin(0.5, 1);
    const hand = this.add.image(cx + 38, feet - 58, '__DEFAULT');
    this.refreshers.push(() => {
      const l = this.setup.loadout;
      avatar.setTexture(lookTexture(this, l)).setScale(ART_SCALE * zoom * lookRes());
      const fist = lookHand();
      if (fist) hand.setPosition(cx + fist.x * ART_SCALE * zoom, feet + fist.y * ART_SCALE * zoom);
      const g = gunLook(this, l.weapon);
      hand.setTexture(g.key).setOrigin(g.ox, g.oy).setScale(g.scale * (fist ? zoom : 1.7)).setRotation(-0.3);
    });
    this.toggle([325, 521, 157, 53], 'ซ่อนหมวก', 'hat');
    this.toggle([482, 521, 146, 53], 'ซ่อนแว่น', 'glasses');

    FASHION_SLOTS.forEach((slot, i) => {
      this.slot([82 + (i % 2) * 112, 176 + Math.floor(i / 2) * 98, 109, 97], FASHION_ICON[slot], FASHION_SLOT_NAME[slot], () => {
        const id = this.setup.loadout.look[slot];
        return id === 'none' ? null : { key: pieceTexture(this, slot, id), name: fashionDef(slot, id)!.name };
      }, () => this.pickFashion(slot));
    });
    EQUIP_SLOTS.forEach((slot, i) => {
      this.slot([650 + (i % 2) * 126, 177 + Math.floor(i / 2) * 99, 123, 101], slot, EQUIP_SLOT_NAME[slot], () => {
        const id = this.setup.loadout.equip[slot];
        return id === 'none' ? null : { key: equipTexture(this, slot, id), name: equipDef(slot, id)!.name };
      }, () => this.pickEquip(slot));
    });
    this.stats();
    this.weapon();
  }

  /**
   * A slot: the piece being worn (picture and name), or, when empty, the painted icon of
   * what goes there over the slot's name.
   */
  private slot(b: Box, icon: string, slotName: string, current: () => { key: string | null; name: string } | null, onClick: (() => void) | null): SliceButton {
    const btn = new SliceButton(this, box(b), TILE, { onClick: onClick ?? undefined });
    const [, , w, h] = box(b);
    const iconBox = { x: w * 0.5, y: h * 0.32, w: w * 0.62, h: h * 0.5 };
    const art = this.add.image(0, 0, '__DEFAULT');
    btn.putAt(art, iconBox.x, iconBox.y);
    const name = label(this, 0, 0, '', 22).setOrigin(0.5);
    btn.putAt(name, w / 2, h * 0.76);
    this.refreshers.push(() => {
      const got = current();
      const c = got?.key ? { key: got.key, name: got.name } : null;
      art.setTexture(c ? c.key : W(`ico-${icon}`)).setAlpha(c ? 1 : 0.9);
      art.setScale(Math.min(iconBox.w / art.width, iconBox.h / art.height));
      name.setText(c ? c.name : slotName).setColor(c ? '#ffffff' : '#c9d2f2');
      fit(name.setScale(1), w * 0.9, h * 0.34);
    });
    return btn;
  }

  /** Hide hat / hide glasses: a navy plate with a tick box. */
  private toggle(b: Box, title: string, k: 'hat' | 'glasses'): void {
    const btn = new SliceButton(this, box(b), TAB_NAVY, {
      onClick: () => { this.setup.loadout.hide[k] = !this.setup.loadout.hide[k]; this.refresh(); },
    });
    const boxImg = fitted(this, W('checkbox'), btn.h * 0.56, btn.h * 0.56);
    const tick = fitted(this, W('tick'), btn.h * 0.6, btn.h * 0.6);
    btn.put(boxImg, 0.2, 0.5).put(tick, 0.21, 0.46);
    btn.put(fit(text(this, title, 24).setOrigin(0, 0.5), btn.w * 0.6, btn.h * 0.72), 0.34, 0.5);
    this.refreshers.push(() => tick.setVisible(this.setup.loadout.hide[k]));
  }

  /** Stat rows under the gear: icon, name, a coloured bar (100% two thirds along) and the value with its change. */
  private stats(): void {
    // 100% sits two thirds along, so gear that raises a stat visibly pushes past it
    const ROWS: { k: keyof Stats; value: (ts: ReturnType<typeof tankStats>) => number; text: (v: number) => string }[] = [
      { k: 'hp', value: (ts) => ts.maxHp / 1000, text: (v) => `${Math.round(v * 1000)}` },
      { k: 'atk', value: (ts) => ts.atk, text: (v) => `${Math.round(v * 100)}%` },
      { k: 'def', value: (ts) => 2 - ts.def, text: (v) => `${Math.round(v * 100)}%` },
      { k: 'move', value: (ts) => ts.move, text: (v) => `${Math.round(v * 100)}%` },
    ];
    const g = this.add.graphics();
    const rows = ROWS.map((r, i) => {
      const dy = i * 35;
      placed(this, W(STAT_LOOK[r.k].icon), box([645, 416 + dy, 32, 31]));
      const [nx, ny, , nh] = box([682, 416 + dy, 63, 29]);
      fit(text(this, STAT_NAME[r.k], 24).setOrigin(0, 0.5).setPosition(nx, ny + nh / 2), box([0, 0, 63, 0])[2], 34);
      const [vx, vy, , vh] = box([872, 415 + dy, 108, 31]);
      return { rail: box([746, 421 + dy, 118, 22]), value: text(this, '', 24, '#ffffff', 4).setOrigin(0, 0.5).setPosition(vx, vy + vh / 2) };
    });
    this.refreshers.push(() => {
      const ts = tankStats(this.setup.loadout);
      const sum = sumStats(this.setup.loadout);
      g.clear();
      ROWS.forEach((r, i) => {
        const [x, y, w, h] = rows[i].rail;
        const v = r.value(ts);
        const up = sum[r.k] > 0;
        const down = sum[r.k] < 0;
        const fill = Math.max(0.06, Math.min(1, v / 1.5));
        g.fillStyle(0x080b19, 1).fillRoundedRect(x, y, w, h, h / 2);
        g.fillStyle(0x0c1024, 1).fillRoundedRect(x + 2, y + 2, w - 4, h - 4, (h - 4) / 2);
        g.fillStyle(STAT_LOOK[r.k].color, 1).fillRoundedRect(x + 1, y + 1, (w - 2) * fill, h - 2, (h - 2) / 2);
        g.fillStyle(0xffffff, 0.25).fillRect(x + 10, y + 4, Math.max(0, (w - 2) * fill - 20), 2);
        rows[i].value.setText(`${r.text(v)}${sum[r.k] ? ` (${fmt(r.k, sum[r.k])})` : ''}`)
          .setColor(up ? '#80ff37' : down ? '#ff6868' : '#ffffff');
        fit(rows[i].value.setScale(1), box([0, 0, 120, 0])[2], 36);
      });
    });
  }

  /** The main weapon on its purple card (tap to change it), its skill, and the fixed secondary slots. */
  private weapon(): void {
    const card = new PlateButton(this, W('weapon-card'), box([952, 175, 214, 176]), () => this.pickWeapon(), [0, 0, 1, 1]);
    const gun = this.add.image(0, 0, '__DEFAULT');
    card.put(gun, 0.5, 0.39);
    const name = text(this, '', 32, '#ffffff', 6).setOrigin(0.5);
    card.put(name, 0.5, 0.845);
    placed(this, W('emphasis'), box([945, 175, 55, 53]));
    const [sx, sy, sw] = box([955, 349, 218, 57]);
    const skill = this.add.text(sx + sw / 2, sy, '', {
      fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#72f6ff', align: 'center', stroke: STROKE, strokeThickness: 4, lineSpacing: -2,
    }).setOrigin(0.5, 0);
    this.refreshers.push(() => {
      const l = this.setup.loadout;
      gun.setTexture(gunLook(this, l.weapon).key);
      gun.setScale(Math.min((card.w * 0.84) / gun.width, (card.h * 0.62) / gun.height));
      name.setText(WEAPONS[l.weapon].name);
      fit(name.setScale(1), card.w * 0.84, card.h * 0.26);
      const sk = WEAPONS[l.weapon].skill!;
      skill.setText(`สกิล E: ${SKILLS[sk].name}\n${SKILLS[sk].desc}`);
      fit(skill.setScale(1), sw, 72);
    });
    this.slot([976, 469, 99, 100], 'drill', 'สว่าน ×2', () => ({ key: W('ico-drill'), name: 'สว่าน ×2' }), null);
    const special = this.slot([1076, 469, 94, 100], 'drill', 'พิเศษ', () => ({ key: W('plus'), name: 'พิเศษ' }), null);
    special.setAlpha(0.8);
  }

  // ---------------------------------------------------------------- items

  /** The items for the match: a coloured card each (icon, name, what it does); tap to take or put back. */
  private itemPicker(): void {
    filled(this, W('items-panel'), box([82, 590, 1108, 261]));
    this.tab([104, 582, 160, 53], TAB_GOLD, 'bag', 'ไอเท็ม');
    const [cx, cy, , ch] = box([287, 595, 106, 37]);
    const count = text(this, '', 31, '#ffff4c', 5).setOrigin(0, 0.5).setPosition(cx, cy + ch / 2);
    const dots = [0, 1, 2].map((i) => placed(this, W('dot'), box([408 + i * 29, 604, 23, 23])));
    const cards: Box[] = [[112, 641, 210, 178], [330, 641, 210, 178], [548, 641, 205, 178], [757, 641, 205, 178], [966, 641, 204, 178]];
    ITEM_IDS.forEach((id, i) => {
      const look = ITEM_LOOK[id];
      const card = new PlateButton(this, W(look.card), box(cards[i]), () => {
        const s = this.setup.items;
        const at = s.indexOf(id);
        if (at >= 0) s.splice(at, 1);
        else if (s.length < LIMITS.itemsPerMatch) s.push(id);
        else this.say(`เลือกได้ ${LIMITS.itemsPerMatch} ชิ้น กดชิ้นที่เลือกแล้วเพื่อเอาออก`);
        this.refresh();
      }, [0, 0, 1, 1]);
      card.put(fitted(this, W(`ico-${look.icon}`), card.w * 0.37, card.h * 0.41), 0.255, 0.275);
      if (id === 'power') card.put(text(this, '+30%', 22, '#fff737', 5).setOrigin(0.5), 0.245, 0.39);
      card.put(fit(text(this, ITEMS[id].name, 31, '#ffffff', 6).setOrigin(0.5), card.w * 0.54, card.h * 0.36), 0.7, 0.27);
      const desc = this.add.text(0, 0, ITEMS[id].desc, {
        fontFamily: FONT, fontSize: '23px', fontStyle: 'bold', color: '#ffffff', align: 'center', stroke: STROKE, strokeThickness: 4,
        wordWrap: { width: card.w * 0.86 }, lineSpacing: -4,
      }).setOrigin(0.5);
      card.put(fit(desc, card.w * 0.88, card.h * 0.42), 0.5, 0.72);
      const tick = fitted(this, W('check'), 44, 44);
      card.putAt(tick, card.w - 14, 14);
      this.refreshers.push(() => {
        const on = this.setup.items.includes(id);
        tick.setVisible(on);
        card.base.setTint(on ? 0xffffff : 0x9097b0);
        card.setAlpha(on ? 1 : 0.78);
      });
    });
    this.refreshers.push(() => {
      const n = this.setup.items.length;
      count.setText(`เลือก ${n}/${LIMITS.itemsPerMatch}`).setColor(n === LIMITS.itemsPerMatch ? '#ffff4c' : '#ffffff');
      dots.forEach((d, i) => d.setTint(i < n ? 0xffffff : 0x4a5070));
    });
  }

  // ---------------------------------------------------------------- right column

  /** Map, format and bot strength (offline only: a friend room or ranked decides these). */
  private rightColumn(): void {
    filled(this, W('setup-panel'), box([1204, 129, 424, 748]));
    this.tab([1215, 109, 158, 53], TAB_GOLD, 'map-pin', 'ด่าน');
    MAP_IDS.forEach((id, i) => {
      const row = this.choice([1233, 169 + i * 69, 370, 65], () => { this.setup.map = id; this.refresh(); }, () => this.setup.map === id, 0.92);
      row.put(fitted(this, W(MAP_THUMB[id]), row.w * 0.33, row.h * 0.78), 0.195, 0.5);
      row.put(fit(text(this, MAPS[id].name, 32).setOrigin(0.5), row.w * 0.42, row.h * 0.72), 0.6, 0.5);
    });
    this.tab([1214, 379, 166, 51], TAB_GOLD, 'swords', 'รูปแบบ');
    FORMATS.forEach((f, i) => {
      const row = this.choice([1235, 435 + i * 55, 368, 51], () => { this.setup.format = f; this.refresh(); }, () => this.setup.format === f, 0.93);
      row.put(fit(text(this, FORMAT_LABEL[f], 31).setOrigin(0.5), row.w * 0.76, row.h * 0.8), 0.5, 0.5);
    });
    this.tab([1214, 604, 260, 49], TAB_GOLD, 'robot', 'ความเก่งของบอท', 26);
    DIFFICULTIES.forEach((d, i) => {
      const row = this.choice([1234 + i * 125, 657, 118, 62], () => { this.setup.difficulty = d; this.refresh(); }, () => this.setup.difficulty === d, 0.92, 0.12);
      row.put(fit(text(this, DIFF_LABEL[d], 33).setOrigin(0.5), row.w * 0.84, row.h * 0.8), 0.5, 0.5);
    });
  }

  /** A row you pick one of: navy plate, gold when picked, with a green tick at (tx, ty). */
  private choice(b: Box, pick: () => void, on: () => boolean, tx: number, ty = 0.5): SliceButton {
    const row = new SliceButton(this, box(b), TAB_NAVY, { selected: ROW_ON, onClick: pick });
    const tick = fitted(this, W('check'), 40, 40);
    // the corner badge sits out on the edge; the row ones inside its right end
    row.put(tick, tx, ty);
    this.refreshers.push(() => {
      row.setSelected(on());
      tick.setVisible(on());
      row.bringToTop(tick);
    });
    return row;
  }

  /** The start button (play mark, gold rays), and for a friend room a cheering fighter above it. */
  private startButton(): void {
    const go = new PlateButton(this, W('btn-start'), box([1216, 739, 402, 118]), () => this.start(), [0, 0, 1, 1]);
    go.put(fitted(this, W('play'), go.w * 0.16, go.h * 0.49), 0.27, 0.5);
    go.put(fit(text(this, this.online ? 'ตกลง' : 'เริ่มเล่น!', 58, '#ffffff', 9).setOrigin(0.5), go.w * 0.54, go.h * 0.72), 0.63, 0.48);
    placed(this, W('emphasis'), box([1556, 721, 67, 57]));
    this.tweens.add({ targets: go, scale: 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** Dressing for a friend room or ranked has no map picks: a painted fighter cheers there instead. */
  private cheer(): void {
    // stands right of the wardrobe panel (which ends at x 1373), feet on the start button
    const scout = this.add.image(1650, 860, 'ui-lobby/scout').setOrigin(0.5, 1);
    scout.setScale(Math.min(600 / scout.height, 500 / scout.width));
    this.tweens.add({ targets: scout, scaleY: scout.scaleY * 1.025, duration: 850, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const rays = this.add.image(1440, 400, 'ui-lobby/emphasis').setFlipX(true);
    rays.setScale(90 / rays.height);
  }

  // ---------------------------------------------------------------- pickers

  private pickFashion(slot: FashionSlot): void {
    const l = this.setup.loadout;
    this.openPicker(`${FASHION_SLOT_NAME[slot]} (ไม่มีผลกับค่าสถานะ)`, fashionIn(slot).map((f) => ({
      on: l.look[slot] === f.id,
      key: pieceTexture(this, slot, f.id),
      title: f.name,
      body: '',
      lock: this.lockText('fashion', slot, f.id, f.exclusive),
      pick: () => { l.look[slot] = f.id; },
      buy: () => this.offer('fashion', slot, f.id, f.name, () => { l.look[slot] = f.id; }),
    })));
  }

  private pickEquip(slot: EquipSlot): void {
    const l = this.setup.loadout;
    this.openPicker(EQUIP_SLOT_NAME[slot], equipIn(slot).map((e) => ({
      on: l.equip[slot] === e.id,
      key: equipTexture(this, slot, e.id),
      title: e.name,
      body: (Object.keys(e.stats) as (keyof Stats)[]).map((k) => `${STAT_NAME[k]} ${fmt(k, e.stats[k]!)}`).join('\n'),
      lock: this.lockText('equip', slot, e.id, false),
      pick: () => { l.equip[slot] = e.id; },
      buy: () => this.offer('equip', slot, e.id, e.name, () => { l.equip[slot] = e.id; }),
    })));
  }

  /** What a piece's card says when it isn't owned yet; undefined when it is. */
  private lockText(kind: ItemKind, slot: string, id: string, exclusive?: boolean): string | undefined {
    if (owns(account.owned(), kind, slot, id)) return undefined;
    const price = priceOf(kind, slot, id);
    return exclusive || !price ? '🔒 Battle Pass' : `🔒 ${priceText(price)}`;
  }

  /** Ask to buy a piece that isn't owned; wear it once bought. */
  private offer(kind: ItemKind, slot: string, id: string, name: string, wear: () => void): void {
    const price = priceOf(kind, slot, id);
    if (!price) return this.say('ชิ้นนี้ได้จาก Battle Pass เท่านั้น');
    if (!account.view) return this.say('ต้องต่อเซิร์ฟเวอร์ก่อนถึงจะซื้อได้');
    confirmBox(this, `ซื้อ ${name}\n${priceText(price)}`, 'ซื้อ', () => {
      account.buy(itemKey(kind, slot, id)).then(() => {
        wear();
        this.refresh();
        this.say(`ได้ ${name} แล้ว`);
      }).catch((err: Error) => this.say(err.message));
    });
  }

  private pickWeapon(): void {
    const l = this.setup.loadout;
    this.openPicker('อาวุธหลัก', MAIN_WEAPONS.map((w) => {
      const def = WEAPONS[w];
      return {
        on: l.weapon === w,
        key: gunLook(this, w).key,
        title: def.name,
        body: `${def.desc}\nสกิล: ${SKILLS[def.skill!].name}`,
        pick: () => { l.weapon = w; },
      };
    }));
  }

  private openPicker(title: string, opts: {
    on: boolean; key: string | null; title: string; body: string; pick: () => void;
    /** Not owned: shown on the card, and tapping offers to buy instead of wearing. */
    lock?: string; buy?: () => void;
  }[]): void {
    this.closePicker();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.picker.push(o), o);
    // the dim layer swallows clicks so nothing behind the window reacts; tapping it closes
    add(this.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.55).setInteractive().setDepth(50))
      .on('pointerdown', () => this.closePicker());
    // up to five cards a row; more wrap to a second row
    const perRow = Math.min(5, opts.length);
    const rows = Math.ceil(opts.length / perRow);
    const w = Math.max(700, perRow * 220 + 60);
    const h = 170 + rows * 320;
    const top = 540 - h / 2;
    add(panel(this, 960, top + h / 2, w, h).setDepth(51));
    add(fit(this.add.text(960, top + 58, title, {
      fontFamily: FONT, fontSize: '38px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 7,
    }).setOrigin(0.5), w - 200, 56).setDepth(53));
    opts.forEach((o, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, opts.length - row * perRow);
      const x = 960 - ((inRow - 1) * 220) / 2 + (i % perRow) * 220;
      const y = top + 270 + row * 320;
      const card = add(new Chip(this, x, y, 200, 300, '', {
        plate: 'slot', onClick: () => {
          this.closePicker();
          if (o.lock) o.buy?.();
          else {
            o.pick();
            this.refresh();
          }
        },
      }).setDepth(52));
      if (o.lock) card.setAlpha(0.85);
      card.setSelected(o.on);
      // picture, name, details, price: each in its own band so long Thai text never runs into the next
      if (o.key) {
        const img = this.add.image(0, -72, o.key);
        img.setScale(110 / Math.max(img.width, img.height));
        card.add(img);
      } else card.add(label(this, 0, -72, '—', 60, '#7d89b3').setOrigin(0.5));
      card.add(fit(label(this, 0, -6, o.title, 24, o.on ? '#ffd166' : '#ffffff').setOrigin(0.5, 0), 180, 36));
      if (o.lock) card.add(fit(label(this, 0, 140, o.lock, 22, '#ffd166').setOrigin(0.5, 1), 180, 32));
      card.add(fit(this.add.text(0, 34, o.body, {
        fontFamily: FONT, fontSize: '17px', color: '#cfd8ff', align: 'center', wordWrap: { width: 176 }, lineSpacing: -2,
      }).setOrigin(0.5, 0), 180, o.lock ? 72 : 106));
    });
    add(new Chip(this, 960 + w / 2 - 62, top + 58, 64, 64, '✕', { size: 30, onClick: () => this.closePicker() }).setDepth(53));
  }

  private closePicker(): void {
    for (const o of this.picker) o.destroy();
    this.picker = [];
  }

}

function fmt(k: keyof Stats, v: number): string {
  const sign = v > 0 ? '+' : '';
  return k === 'hp' ? `${sign}${v}` : `${sign}${v}%`;
}
