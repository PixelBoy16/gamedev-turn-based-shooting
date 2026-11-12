import Phaser from 'phaser';
import { ART_SCALE, equipTexture, gunLook, iconTexture, lookHand, lookRes, lookTexture, pieceTexture } from '../art/chibi';
import { ITEMS, ITEM_IDS, ItemId, LIMITS, MAIN_WEAPONS, SKILLS, WEAPONS } from '../core/data';
import {
  EQUIP_SLOTS, EQUIP_SLOT_NAME, EquipSlot, FASHION_SLOTS, FASHION_SLOT_NAME, FashionSlot, STAT_NAME, Stats,
  equipDef, equipIn, fashionDef, fashionIn, sumStats, tankStats,
} from '../core/gear';
import { MAPS, MAP_IDS } from '../core/Maps';
import { Difficulty } from '../core/BotAI';
import { FONT, confirmBox, fit, label } from '../ui/widgets';
import { Chip, PlateButton, STROKE, accents, panel, plate, screenChrome, tab } from '../ui/plates';
import { account } from '../net/account';
import { ItemKind, enforceOwned, itemKey, owns, priceOf, priceText } from '../core/shop';
import { DIFF_LABEL, FORMAT_LABEL, Format, MatchSetup, loadSetup, saveSetup } from './setup';

const FORMATS: Format[] = ['1v1', '1v2', '2v2'];
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

/** Each item card wears one of the painted button plates, so the row reads at a glance. */
const ITEM_PLATE: Record<ItemId, { key: string; inset: number; s: number }> = {
  double: { key: 'ui-lobby/btn-join', inset: 46, s: 0.62 },
  power: { key: 'ui-btn-ranked', inset: 46, s: 0.62 },
  warp: { key: 'ui-btn-pass', inset: 34, s: 0.8 },
  heal: { key: 'ui-lobby/btn-create', inset: 46, s: 0.62 },
  armor: { key: 'ui-lobby/btn-join', inset: 46, s: 0.62 },
};

/** Stat rows: an icon from the painted sets and a bar colour each. */
const STAT_LOOK: Record<keyof Stats, { icon: string; color: number }> = {
  hp: { icon: 'art-icon-heal', color: 0xff4d5e },
  atk: { icon: 'ui-ranked/ico-match', color: 0x62e05a },
  def: { icon: 'art-icon-armor', color: 0xffc23d },
  move: { icon: 'ui-arrow', color: 0xff8a1f },
};

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
    // the wardrobe panel spans x 55..1325, y 165..665 (tabs sit on its top edge, clear of the
    // title plate); the items panel below matches its width
    panel(this, 690, 415, 1270, 500);
    accents(this, 55, 165, 1270, 500);
    // faint dividers between looks, the stage, and stats
    this.add.rectangle(318, 420, 3, 400, 0x8991b6, 0.3);
    this.add.rectangle(1075, 420, 3, 400, 0x8991b6, 0.3);

    this.stage(540, 392);
    const zoom = 2.4;
    const feet = 522;
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
      const btn = new Chip(this, 465 + i * 152, 622, 142, 46, k === 'hat' ? 'ซ่อนหมวก' : 'ซ่อนแว่น', {
        size: 22, onClick: () => { this.setup.loadout.hide[k] = !this.setup.loadout.hide[k]; this.refresh(); },
      });
      // a tick box on the left of the label
      const box = this.add.graphics();
      btn.add(box);
      btn.placeText(14, 0, 90, 36);
      this.refreshers.push(() => {
        const on = this.setup.loadout.hide[k];
        btn.setSelected(on);
        box.clear();
        box.fillStyle(0x091024, 1).fillRoundedRect(-62, -12, 24, 24, 5);
        box.lineStyle(3, on ? 0xffc23d : 0x8991b6, 1).strokeRoundedRect(-62, -12, 24, 24, 5);
        if (on) box.lineStyle(4, 0xffc23d, 1).strokePoints([{ x: -57, y: 0 }, { x: -52, y: 6 }, { x: -43, y: -6 }] as unknown as Phaser.Math.Vector2[]);
      });
    });

    tab(this, 70, 165, 'แฟชั่น · แค่หน้าตา', { icon: 'ui-lobby/ico-wardrobe' });
    FASHION_SLOTS.forEach((slot, i) => {
      const sample = fashionIn(slot).find((f) => f.id !== 'none')?.id;
      this.tile(135 + (i % 2) * 112, 240 + Math.floor(i / 2) * 98, FASHION_SLOT_NAME[slot], () => {
        const id = this.setup.loadout.look[slot];
        return { key: pieceTexture(this, slot, id), name: id === 'none' ? '' : fashionDef(slot, id)!.name };
      }, () => this.pickFashion(slot), sample ? pieceTexture(this, slot, sample) : null);
    });

    tab(this, 745, 165, 'อุปกรณ์ · ค่าสถานะ', { icon: 'art-icon-wall' });
    EQUIP_SLOTS.forEach((slot, i) => {
      const sample = equipIn(slot).find((e) => e.id !== 'none')?.id;
      this.tile(840 + (i % 2) * 124, 244 + Math.floor(i / 2) * 100, EQUIP_SLOT_NAME[slot], () => {
        const id = this.setup.loadout.equip[slot];
        return { key: equipTexture(this, slot, id), name: id === 'none' ? '' : equipDef(slot, id)!.name };
      }, () => this.pickEquip(slot), sample ? equipTexture(this, slot, sample) : null, 112);
    });
    this.stats(760, 450);

    tab(this, 1095, 165, 'อาวุธ', { color: 0xe8333a, icon: 'ui-ranked/ico-match' });
    this.weaponCard(1200, 292);
    const skill = this.add.text(1200, 392, '', {
      fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#8ef0ff', align: 'center', wordWrap: { width: 220 }, lineSpacing: 2,
      stroke: STROKE, strokeThickness: 3,
    }).setOrigin(0.5, 0);
    this.refreshers.push(() => {
      const sk = WEAPONS[this.setup.loadout.weapon].skill!;
      skill.setText(`สกิล E: ${SKILLS[sk].name}\n${SKILLS[sk].desc}`);
    });
    this.tile(1146, 588, 'อาวุธรอง', () => ({ key: gunLook(this, 'drill').key, name: 'สว่าน ×2' }), null, null, 98);
    const special = new Chip(this, 1254, 588, 98, 92, '', {});
    special.setAlpha(0.75);
    const plus = this.add.graphics();
    plus.fillStyle(0x8991b6, 0.9).fillRoundedRect(-4, -30, 8, 32, 3).fillRoundedRect(-16, -18, 32, 8, 3);
    special.add([plus, label(this, 0, 30, 'พิเศษ', 17, '#9aa6cf').setOrigin(0.5)]);
  }

  /** Stat rows under the gear: icon, name, a coloured bar (100% two thirds along) and the value with its change. */
  private stats(x: number, y0: number): void {
    // 100% sits two thirds along, so gear that raises a stat visibly pushes past it
    const ROWS: { k: keyof Stats; value: (ts: ReturnType<typeof tankStats>) => number; text: (v: number) => string }[] = [
      { k: 'hp', value: (ts) => ts.maxHp / 1000, text: (v) => `${Math.round(v * 1000)}` },
      { k: 'atk', value: (ts) => ts.atk, text: (v) => `${Math.round(v * 100)}%` },
      { k: 'def', value: (ts) => 2 - ts.def, text: (v) => `${Math.round(v * 100)}%` },
      { k: 'move', value: (ts) => ts.move, text: (v) => `${Math.round(v * 100)}%` },
    ];
    const rowY = (i: number) => y0 + i * 42;
    const barX = x + 118;
    const barW = 112;
    const g = this.add.graphics();
    const texts = ROWS.map((r, i) => {
      if (this.textures.exists(STAT_LOOK[r.k].icon)) {
        const icon = this.add.image(x + 14, rowY(i), STAT_LOOK[r.k].icon);
        icon.setScale(Math.min(30 / icon.width, 30 / icon.height));
      }
      return {
        name: label(this, x + 38, rowY(i), STAT_NAME[r.k], 21, '#ffffff').setOrigin(0, 0.5),
        value: label(this, barX + barW + 10, rowY(i), '', 20).setOrigin(0, 0.5),
      };
    });
    this.refreshers.push(() => {
      const ts = tankStats(this.setup.loadout);
      const sum = sumStats(this.setup.loadout);
      g.clear();
      ROWS.forEach((r, i) => {
        const y = rowY(i);
        const v = r.value(ts);
        const up = sum[r.k] > 0;
        const down = sum[r.k] < 0;
        const fill = Math.min(1, v / 1.5);
        g.fillStyle(0x091024, 1).fillRoundedRect(barX, y - 9, barW, 18, 9);
        g.fillStyle(STAT_LOOK[r.k].color, 1).fillRoundedRect(barX + 2, y - 7, Math.max(8, fill * (barW - 4)), 14, 7);
        g.fillStyle(0xffffff, 0.35).fillRoundedRect(barX + 4, y - 6, Math.max(4, fill * (barW - 8)), 4, 2);
        g.fillStyle(0xffffff, 0.7).fillRect(barX + barW * (2 / 3), y - 11, 2, 22); // the 100% mark
        texts[i].value.setText(`${r.text(v)}${sum[r.k] ? ` (${fmt(r.k, sum[r.k])})` : ''}`)
          .setColor(up ? '#7dff8a' : down ? '#ff8a80' : '#ffffff');
        fit(texts[i].value.setScale(1), 1072 - texts[i].value.x - 6, 30);
      });
    });
  }

  /** The main weapon on a purple plate with gold rays; tap to change it. */
  private weaponCard(x: number, y: number): void {
    const rays = this.add.image(x + 96, y - 80, 'ui-lobby/emphasis').setFlipX(true);
    rays.setScale(64 / rays.height);
    const card = new Chip(this, x, y, 210, 170, '', { onClick: () => this.pickWeapon() });
    card.addAt(plate(this, 'ui-btn-pass', 0, 0, 210, 170, 34, 0.8), 2);
    const img = this.add.image(0, -18, '__DEFAULT');
    card.add(img);
    card.text.setFontSize(30);
    this.refreshers.push(() => {
      const l = this.setup.loadout;
      img.setTexture(gunLook(this, l.weapon).key);
      img.setScale(Math.min(170 / img.width, 100 / img.height));
      card.text.setText(WEAPONS[l.weapon].name);
      card.placeText(0, 56, 190, 40);
    });
  }

  /**
   * The stage the character stands on: a round window with a glowing orange rim, a lamp
   * at the top throwing a cone of light down, and the painted glowing ring at the feet.
   */
  private stage(x: number, y: number): void {
    const r = 168;
    if (!this.textures.exists('wardrobe-stage')) {
      const size = r * 2;
      const tex = this.textures.createCanvas('wardrobe-stage', size, size)!;
      const c = tex.context;
      const bg = c.createRadialGradient(r, r * 0.9, 20, r, r, r);
      bg.addColorStop(0, '#3a3256');
      bg.addColorStop(0.6, '#211d3a');
      bg.addColorStop(1, '#100e22');
      c.fillStyle = bg;
      c.beginPath();
      c.arc(r, r, r, 0, Math.PI * 2);
      c.fill();
      // the cone from the lamp, fading out toward the floor
      const cone = c.createLinearGradient(0, 10, 0, size - 30);
      cone.addColorStop(0, 'rgba(255,214,140,0.55)');
      cone.addColorStop(1, 'rgba(255,170,60,0.06)');
      c.fillStyle = cone;
      c.beginPath();
      c.moveTo(r - 34, 14);
      c.lineTo(r + 34, 14);
      c.lineTo(r + 150, size - 40);
      c.lineTo(r - 150, size - 40);
      c.closePath();
      c.fill();
      tex.refresh();
    }
    this.add.image(x, y, 'wardrobe-stage');
    const rim = this.add.graphics({ x, y });
    rim.lineStyle(18, 0xff8a1f, 0.18).strokeCircle(0, 0, r + 6);
    rim.lineStyle(10, 0x091024, 1).strokeCircle(0, 0, r);
    rim.lineStyle(7, 0xff9a2e, 1).strokeCircle(0, 0, r);
    rim.lineStyle(2, 0xffd59a, 0.8).strokeCircle(0, 0, r - 5);
    // the lamp
    rim.fillStyle(0x2a2d40, 1).fillRoundedRect(-30, -r + 4, 60, 16, 6);
    rim.fillStyle(0xfff1c4, 1).fillEllipse(0, -r + 20, 46, 10);
    // glowing floor under the feet
    const ring = this.add.image(x, y + 128, 'ui-lobby/avatar-ring');
    ring.setScale(240 / ring.width);
    this.tweens.add({ targets: ring, alpha: 0.65, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /**
   * A slot: the piece's picture and name, or (empty) a white outline of a sample piece
   * over the slot name, so every slot says what goes in it.
   */
  private tile(
    x: number, y: number, slotName: string, current: () => { key: string | null; name: string },
    onClick: (() => void) | null, ghostKey: string | null = null, w = 100, h = 92,
  ): void {
    const btn = new Chip(this, x, y, w, h, '', { onClick: onClick ?? undefined });
    if (!onClick) btn.setAlpha(0.8);
    const img = this.add.image(0, -12, '__DEFAULT');
    const ghost = ghostKey ? this.add.image(0, -12, ghostKey).setTint(0xffffff).setTintMode(Phaser.TintModes.FILL).setAlpha(0.85) : null;
    if (ghost) ghost.setScale(Math.min((w - 46) / ghost.width, (h - 46) / ghost.height));
    const name = label(this, 0, h / 2 - 8, '', 17).setOrigin(0.5, 1);
    btn.add([img, name]);
    if (ghost) btn.add(ghost);
    this.refreshers.push(() => {
      const c = current();
      img.setVisible(!!c.key);
      ghost?.setVisible(!c.key);
      name.setText(c.key ? c.name : slotName).setColor(c.key ? '#ffffff' : '#c9d2f2');
      fit(name.setScale(1), w - 12, 24);
      if (c.key) {
        img.setTexture(c.key);
        img.setScale(Math.min((w - 30) / img.width, (h - 36) / img.height));
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

  /** The items for the match: a coloured card each (icon, name, what it does); tap to take or put back. */
  private itemPicker(): void {
    const top = 700; // panel y 700..935
    panel(this, 690, top + 117, 1270, 235);
    accents(this, 55, top, 1270, 235);
    const tw = tab(this, 70, top, 'ไอเท็ม', { icon: 'ui-ico-shop' });
    const count = label(this, 70 + tw + 22, top, '', 26).setOrigin(0, 0.5);
    const pips = this.add.graphics();
    const w = 232;
    ITEM_IDS.forEach((id, i) => {
      const x = 85 + w / 2 + i * (w + 12.5);
      const look = ITEM_PLATE[id];
      const card = new Chip(this, x, top + 122, w, 170, '', {
        onClick: () => {
          const s = this.setup.items;
          const at = s.indexOf(id);
          if (at >= 0) s.splice(at, 1);
          else if (s.length < LIMITS.itemsPerMatch) s.push(id);
          else this.say(`เลือกได้ ${LIMITS.itemsPerMatch} ชิ้น กดชิ้นที่เลือกแล้วเพื่อเอาออก`);
          this.refresh();
        },
      });
      const face = plate(this, look.key, 0, 0, w, 170, look.inset, look.s);
      card.addAt(face, 2);
      const icon = iconTexture(this, id);
      if (icon) {
        const img = this.add.image(-62, -44, icon);
        card.add(img.setScale(68 / Math.max(img.width, img.height)));
      }
      card.text.setText(ITEMS[id].name).setOrigin(0, 0.5).setFontSize(30);
      card.placeText(-22, -44, 122, 44);
      const desc = this.add.text(0, 22, ITEMS[id].desc, {
        fontFamily: FONT, fontSize: '19px', fontStyle: 'bold', color: '#ffffff', align: 'center', wordWrap: { width: 200 }, lineSpacing: 0,
        stroke: STROKE, strokeThickness: 3,
      }).setOrigin(0.5, 0);
      card.add(fit(desc, 204, 66));
      // picked: full colour with a gold rim and a tick; not picked: dimmed
      const rim = this.add.graphics();
      rim.lineStyle(10, 0xffc23d, 0.35).strokeRoundedRect(-w / 2 + 2, -83, w - 4, 166, 20);
      rim.lineStyle(4, 0xffd166, 1).strokeRoundedRect(-w / 2 + 4, -81, w - 8, 162, 18);
      rim.fillStyle(0x091024, 1).fillCircle(w / 2 - 20, -66, 15);
      rim.fillStyle(0xffc23d, 1).fillCircle(w / 2 - 20, -66, 12);
      rim.lineStyle(4, 0x091024, 1).strokePoints([{ x: w / 2 - 26, y: -66 }, { x: w / 2 - 21, y: -61 }, { x: w / 2 - 13, y: -71 }] as unknown as Phaser.Math.Vector2[]);
      card.add(rim);
      this.refreshers.push(() => {
        const on = this.setup.items.includes(id);
        rim.setVisible(on);
        face.setTint(on ? 0xffffff : 0x8a8fa8);
        card.setAlpha(on ? 1 : 0.85);
      });
    });
    this.refreshers.push(() => {
      const n = this.setup.items.length;
      count.setText(`เลือก ${n}/${LIMITS.itemsPerMatch}`).setColor(n === LIMITS.itemsPerMatch ? '#ffd166' : '#ffffff');
      pips.clear();
      for (let i = 0; i < LIMITS.itemsPerMatch; i++) {
        const px = count.x + count.width + 24 + i * 28;
        pips.fillStyle(0x091024, 1).fillCircle(px, top, 11);
        pips.fillStyle(i < n ? 0xffa21f : 0x3a4370, 1).fillCircle(px, top, 8);
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
    panel(this, cx, 547, 500, 764); // y 165..929
    accents(this, cx - 250, 165, 500, 764);
    tab(this, cx - 235, 165, 'ด่าน');
    const mapDesc = label(this, cx, 452, '', 22, '#cfd8ff').setOrigin(0.5, 0.5);
    MAP_IDS.forEach((id, i) => {
      const btn = new Chip(this, cx, 252 + i * 64, 420, 58, MAPS[id].name, {
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

    tab(this, cx - 235, 522, 'รูปแบบ');
    FORMATS.forEach((f, i) => {
      const btn = new Chip(this, cx, 578 + i * 62, 420, 54, FORMAT_LABEL[f], {
        size: 28, onClick: () => { this.setup.format = f; this.refresh(); },
      });
      this.refreshers.push(() => btn.setSelected(this.setup.format === f));
    });

    tab(this, cx - 235, 780, 'ความเก่งของบอท');
    DIFFICULTIES.forEach((d, i) => {
      const btn = new Chip(this, cx - 142 + i * 142, 852, 132, 56, DIFF_LABEL[d], {
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
