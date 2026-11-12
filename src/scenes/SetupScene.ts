import Phaser from 'phaser';
import { ART_SCALE, equipTexture, gunLook, iconTexture, lookHand, lookRes, lookTexture, pieceTexture } from '../art/chibi';
import { ITEMS, ITEM_IDS, LIMITS, MAIN_WEAPONS, SKILLS, WEAPONS } from '../core/data';
import {
  EQUIP_SLOTS, EQUIP_SLOT_NAME, EquipSlot, FASHION_SLOTS, FASHION_SLOT_NAME, FashionSlot, STAT_NAME, Stats,
  equipDef, equipIn, fashionDef, fashionIn, sumStats, tankStats,
} from '../core/gear';
import { MAPS, MAP_IDS } from '../core/Maps';
import { Difficulty } from '../core/BotAI';
import { FONT, confirmBox, fit, label } from '../ui/widgets';
import { THEME } from '../ui/theme';
import { Chip, PlateButton, STROKE, heading, panel, screenChrome } from '../ui/plates';
import { account } from '../net/account';
import { ItemKind, enforceOwned, itemKey, owns, priceOf, priceText } from '../core/shop';
import { DIFF_LABEL, FORMAT_LABEL, Format, MatchSetup, loadSetup, saveSetup } from './setup';

const FORMATS: Format[] = ['1v1', '1v2', '2v2'];
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

/**
 * Pick character, 3 items, map, format and bot difficulty. No mockup of its own: built
 * from the theme kit (src/ui/plates.ts) so it matches the painted screens around it.
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
    const bg = this.add.image(960, 540, 'ui-lobby/bg');
    bg.setScale(Math.max(1920 / bg.width, 1080 / bg.height));
    screenChrome(this, { title: 'ตู้เสื้อผ้า', icon: 'ui-lobby/ico-wardrobe', onBack: () => this.scene.start(this.returnTo ?? 'menu') });

    this.wardrobe();
    this.itemPicker();
    if (!this.online) this.rightColumn();
    else this.cheer();

    this.hint = label(this, 960, 1040, '', 28, '#ffd166').setOrigin(0.5).setDepth(10);
    // the green plate is the call to action; it breathes so the eye finds it
    const go = new PlateButton(this, 'ui-lobby/btn-create', [1420, 940, 440, 126], () => this.start());
    const t = this.add.text(0, 0, this.online ? 'ตกลง' : 'เริ่มเล่น!', {
      fontFamily: FONT, fontSize: '54px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 9,
    }).setOrigin(0.5);
    go.put(fit(t, go.w * 0.7, go.h * 0.6), 0.5, 0.48);
    this.tweens.add({ targets: go, scale: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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

  private say(msg: string): void {
    this.hint.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.hint);
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 1800, duration: 400 });
  }

  // ---------------------------------------------------------------- wardrobe

  /**
   * Fashion slots on the left (looks only), the chibi on a magic circle in the
   * middle, equipment slots and stats on the right (numbers only), weapons at the
   * far right. Tapping a slot opens a picker with every piece for it.
   */
  private wardrobe(): void {
    // the wardrobe panel spans x 55..1325, y 140..660; the item cards below match its width
    panel(this, 690, 400, 1270, 520);
    // faint dividers between looks, the stage, and stats
    this.add.rectangle(315, 405, 3, 430, 0x8991b6, 0.35);
    this.add.rectangle(1065, 405, 3, 430, 0x8991b6, 0.35);
    this.turntable(540, 395);
    const zoom = 2.5;
    const feet = 512;
    const avatar = this.add.image(540, feet, '__DEFAULT').setOrigin(0.5, 1);
    const hand = this.add.image(578, feet - 45, '__DEFAULT');
    this.refreshers.push(() => {
      const l = this.setup.loadout;
      avatar.setTexture(lookTexture(this, l)).setScale(ART_SCALE * zoom * lookRes());
      const fist = lookHand();
      if (fist) hand.setPosition(540 + fist.x * ART_SCALE * zoom, feet + fist.y * ART_SCALE * zoom);
      const g = gunLook(this, l.weapon);
      hand.setTexture(g.key).setOrigin(g.ox, g.oy).setScale(g.scale * (fist ? zoom : 1.7)).setRotation(-0.3);
    });
    (['hat', 'glasses'] as const).forEach((k, i) => {
      const btn = new Chip(this, 470 + i * 140, 615, 130, 50, k === 'hat' ? 'ซ่อนหมวก' : 'ซ่อนแว่น', {
        size: 22, onClick: () => { this.setup.loadout.hide[k] = !this.setup.loadout.hide[k]; this.refresh(); },
      });
      this.refreshers.push(() => btn.setSelected(this.setup.loadout.hide[k]));
    });

    heading(this, 100, 192, 'แฟชั่น · แค่หน้าตา', 190);
    FASHION_SLOTS.forEach((slot, i) => {
      this.tile(145 + (i % 2) * 110, 258 + Math.floor(i / 2) * 104, FASHION_SLOT_NAME[slot], () => {
        const id = this.setup.loadout.look[slot];
        return { key: pieceTexture(this, slot, id), name: id === 'none' ? '' : fashionDef(slot, id)!.name };
      }, () => this.pickFashion(slot), 98);
    });

    heading(this, 770, 192, 'อุปกรณ์ · ค่าสถานะ', 270);
    EQUIP_SLOTS.forEach((slot, i) => {
      this.tile(830 + (i % 2) * 120, 268 + Math.floor(i / 2) * 116, EQUIP_SLOT_NAME[slot], () => {
        const id = this.setup.loadout.equip[slot];
        return { key: equipTexture(this, slot, id), name: id === 'none' ? '' : equipDef(slot, id)!.name };
      }, () => this.pickEquip(slot));
    });
    // stat bars: 100% sits two thirds along, so gear that raises a stat visibly pushes past it
    const STAT_ROWS: { k: keyof Stats; value: (ts: ReturnType<typeof tankStats>) => number; text: (v: number) => string }[] = [
      { k: 'hp', value: (ts) => ts.maxHp / 1000, text: (v) => `${Math.round(v * 1000)}` },
      { k: 'atk', value: (ts) => ts.atk, text: (v) => `${Math.round(v * 100)}%` },
      { k: 'def', value: (ts) => 2 - ts.def, text: (v) => `${Math.round(v * 100)}%` },
      { k: 'move', value: (ts) => ts.move, text: (v) => `${Math.round(v * 100)}%` },
    ];
    const rowY = (i: number) => 492 + i * 38;
    const statG = this.add.graphics();
    const statText = STAT_ROWS.map((_, i) => ({
      name: label(this, 770, rowY(i), STAT_NAME[STAT_ROWS[i].k], 21, '#cfd8ff').setOrigin(0, 0.5),
      value: label(this, 975, rowY(i), '', 21).setOrigin(0, 0.5),
    }));
    this.refreshers.push(() => {
      const ts = tankStats(this.setup.loadout);
      const sum = sumStats(this.setup.loadout);
      statG.clear();
      STAT_ROWS.forEach((r, i) => {
        const y = rowY(i);
        const v = r.value(ts);
        const up = sum[r.k] > 0;
        const down = sum[r.k] < 0;
        statG.fillStyle(0x091024, 1);
        statG.fillRoundedRect(850, y - 8, 115, 16, 8);
        statG.fillStyle(up ? 0x7dff8a : down ? THEME.red : 0xffc23d, 1);
        statG.fillRoundedRect(852, y - 6, Math.max(6, Math.min(1, v / 1.5) * 111), 12, 6);
        statG.fillStyle(0xffffff, 0.6);
        statG.fillRect(850 + 115 * (2 / 3), y - 10, 2, 20); // the 100% mark
        statText[i].value.setText(`${r.text(v)}${sum[r.k] ? ` (${fmt(r.k, sum[r.k])})` : ''}`)
          .setColor(up ? '#7dff8a' : down ? '#ff8a80' : '#ffffff');
      });
    });

    heading(this, 1095, 192, 'อาวุธ', 190);
    this.tile(1190, 300, 'อาวุธหลัก', () => ({ key: gunLook(this, this.setup.loadout.weapon).key, name: WEAPONS[this.setup.loadout.weapon].name }),
      () => this.pickWeapon(), 170);
    const skill = this.add.text(1190, 395, '', {
      fontFamily: FONT, fontSize: '20px', color: '#8ef0ff', align: 'center', wordWrap: { width: 230 }, lineSpacing: 4,
    }).setOrigin(0.5, 0);
    this.refreshers.push(() => {
      const sk = WEAPONS[this.setup.loadout.weapon].skill!;
      skill.setText(`สกิล E: ${SKILLS[sk].name}\n${SKILLS[sk].desc}`);
    });
    this.tile(1135, 580, 'อาวุธรอง', () => ({ key: gunLook(this, 'drill').key, name: 'สว่าน ×2' }), null);
    this.tile(1245, 580, 'พิเศษ', () => ({ key: null, name: '' }), null);
  }

  /** A navy turntable under the character: gold rim, turning tick marks, and the glowing ring at the feet. */
  private turntable(x: number, y: number): void {
    const g = this.add.graphics({ x, y });
    g.fillStyle(0xffb347, 0.05); // warm light behind the character
    for (let r = 120; r <= 200; r += 20) g.fillCircle(0, -10, r);
    g.fillStyle(0x091024, 0.9);
    g.fillCircle(0, 0, 200);
    g.fillStyle(0x1d2346, 0.95);
    g.fillCircle(0, 0, 190);
    g.lineStyle(6, 0xffc23d, 0.9);
    g.strokeCircle(0, 0, 190);
    g.lineStyle(2, 0xffffff, 0.12);
    g.strokeCircle(0, 0, 150);
    const ticks = this.add.graphics({ x, y });
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const long = i % 3 === 0;
      ticks.lineStyle(long ? 4 : 2, long ? 0xffc23d : 0xffffff, long ? 0.9 : 0.25);
      ticks.lineBetween(Math.cos(a) * 166, Math.sin(a) * 166, Math.cos(a) * (long ? 182 : 176), Math.sin(a) * (long ? 182 : 176));
    }
    // a slow turn keeps the stage alive without pulling the eye off the character
    this.tweens.add({ targets: ticks, angle: 360, duration: 40000, repeat: -1 });
    // the glowing ring from the painted screens, under the feet
    const ring = this.add.image(x, y + 117, 'ui-lobby/avatar-ring');
    ring.setScale(260 / ring.width);
  }

  /** A square slot: the piece's picture and name, or the faded slot name when empty. */
  private tile(
    x: number, y: number, slotName: string, current: () => { key: string | null; name: string },
    onClick: (() => void) | null, size = 104,
  ): void {
    const btn = new Chip(this, x, y, size, size, '', { plate: 'slot', onClick: onClick ?? undefined });
    if (!onClick) btn.setAlpha(0.7);
    const img = this.add.image(0, -8, '__DEFAULT');
    const empty = label(this, 0, 0, slotName, 22, '#7d89b3').setOrigin(0.5);
    fit(empty, size - 16, 40);
    const name = label(this, 0, size / 2 - 6, '', 15).setOrigin(0.5, 1);
    btn.add([img, empty, name]);
    this.refreshers.push(() => {
      const c = current();
      img.setVisible(!!c.key);
      empty.setVisible(!c.key);
      name.setText(c.key ? c.name : '');
      fit(name.setScale(1), size - 14, 22);
      if (c.key) {
        img.setTexture(c.key);
        img.setScale((size - 34) / Math.max(img.width, img.height));
      }
    });
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

  /** The items for the match: a card each (icon, name, what it does); tap to take or put back. */
  private itemPicker(): void {
    const top = 690;
    const title = heading(this, 70, top, 'ไอเท็ม');
    const count = label(this, title.x + title.width + 24, top, '', 28).setOrigin(0, 0.5);
    const pips = this.add.graphics();
    ITEM_IDS.forEach((id, i) => {
      const x = 55 + 120 + i * 257.5;
      const card = new Chip(this, x, top + 140, 240, 210, '', {
        plate: 'slot', onClick: () => {
          const s = this.setup.items;
          const at = s.indexOf(id);
          if (at >= 0) s.splice(at, 1);
          else if (s.length < LIMITS.itemsPerMatch) s.push(id);
          else this.say(`เลือกได้ ${LIMITS.itemsPerMatch} ชิ้น กดชิ้นที่เลือกแล้วเพื่อเอาออก`);
          this.refresh();
        },
      });
      const icon = iconTexture(this, id);
      if (icon) {
        const img = this.add.image(-70, -56, icon);
        card.add(img.setScale(70 / Math.max(img.width, img.height)));
      }
      card.text.setText(ITEMS[id].name).setOrigin(0, 0.5);
      card.placeText(-26, -56, 130, 44);
      card.add(this.add.text(0, 2, ITEMS[id].desc, {
        fontFamily: FONT, fontSize: '19px', color: '#cfd8ff', align: 'center', wordWrap: { width: 204 }, lineSpacing: 2,
      }).setOrigin(0.5, 0));
      this.refreshers.push(() => card.setSelected(this.setup.items.includes(id)));
    });
    this.refreshers.push(() => {
      const n = this.setup.items.length;
      count.setText(`เลือก ${n}/${LIMITS.itemsPerMatch}`).setColor(n === LIMITS.itemsPerMatch ? '#ffd166' : '#ffffff');
      pips.clear();
      for (let i = 0; i < LIMITS.itemsPerMatch; i++) {
        const px = count.x + count.width + 26 + i * 28;
        pips.fillStyle(0x091024, 1);
        pips.fillCircle(px, top, 11);
        pips.fillStyle(i < n ? 0xffc23d : 0x3a4370, 1);
        pips.fillCircle(px, top, 8);
      }
    });
  }

  /** Dressing for a friend room or ranked has no map picks: a painted fighter cheers there instead. */
  private cheer(): void {
    const scout = this.add.image(1640, 905, 'ui-lobby/scout').setOrigin(0.5, 1);
    scout.setScale(560 / scout.height);
    this.tweens.add({ targets: scout, scaleY: scout.scaleY * 1.025, duration: 850, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const rays = this.add.image(1420, 520, 'ui-lobby/emphasis').setFlipX(true);
    rays.setScale(90 / rays.height);
    const crate = this.add.image(1690, 1080, 'ui-lobby/crate-right').setOrigin(0.5, 1);
    crate.setScale(420 / crate.width);
  }

  /** Map, format and bot strength (offline only: a friend room or ranked decides these). */
  private rightColumn(): void {
    const cx = 1615;
    panel(this, cx, 525, 500, 800); // y 125..925
    heading(this, cx - 205, 182, 'ด่าน', 410);
    const mapDesc = label(this, cx, 448, '', 22, '#cfd8ff').setOrigin(0.5, 0.5);
    MAP_IDS.forEach((id, i) => {
      const btn = new Chip(this, cx, 244 + i * 64, 420, 58, MAPS[id].name, {
        size: 30, onClick: () => { this.setup.map = id; this.refresh(); },
      });
      // a strip of the map's painted backdrop on the left of its button
      const art = `art-bg-${id}`;
      if (this.textures.exists(art)) {
        const thumb = this.add.image(-148, 0, art);
        const k = 40 / thumb.height;
        const cropW = 104 / k;
        thumb.setScale(k).setCrop((thumb.width - cropW) / 2, 0, cropW, thumb.height);
        btn.addAt(thumb, 2);
        btn.placeText(45, 0, 300, 52);
      }
      this.refreshers.push(() => btn.setSelected(this.setup.map === id));
    });
    this.refreshers.push(() => mapDesc.setText(MAPS[this.setup.map].desc));

    heading(this, cx - 205, 512, 'รูปแบบ', 410);
    FORMATS.forEach((f, i) => {
      const btn = new Chip(this, cx, 572 + i * 64, 420, 56, FORMAT_LABEL[f], {
        size: 28, onClick: () => { this.setup.format = f; this.refresh(); },
      });
      this.refreshers.push(() => btn.setSelected(this.setup.format === f));
    });

    heading(this, cx - 205, 778, 'ความเก่งของบอท', 410);
    DIFFICULTIES.forEach((d, i) => {
      const btn = new Chip(this, cx - 142 + i * 142, 842, 132, 58, DIFF_LABEL[d], {
        size: 28, onClick: () => { this.setup.difficulty = d; this.refresh(); },
      });
      this.refreshers.push(() => btn.setSelected(this.setup.difficulty === d));
    });
  }
}

function fmt(k: keyof Stats, v: number): string {
  const sign = v > 0 ? '+' : '';
  return k === 'hp' ? `${sign}${v}` : `${sign}${v}%`;
}
