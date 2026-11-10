import Phaser from 'phaser';
import { ART_SCALE, equipTexture, gunLook, iconTexture, lookHand, lookRes, lookTexture, pieceTexture } from '../art/chibi';
import { ITEMS, ITEM_IDS, LIMITS, MAIN_WEAPONS, SKILLS, WEAPONS } from '../core/data';
import {
  EQUIP_SLOTS, EQUIP_SLOT_NAME, EquipSlot, FASHION_SLOTS, FASHION_SLOT_NAME, FashionSlot, STAT_NAME, Stats,
  equipDef, equipIn, fashionDef, fashionIn, sumStats, tankStats,
} from '../core/gear';
import { MAPS, MAP_IDS } from '../core/Maps';
import { Difficulty } from '../core/BotAI';
import { Button, FONT, confirmBox, fit, label, sectionTab, walletText } from '../ui/widgets';
import { THEME, drawPlate, drawRibbon } from '../ui/theme';
import { account } from '../net/account';
import { ItemKind, enforceOwned, itemKey, owns, priceOf, priceText } from '../core/shop';
import { menuBackdrop } from './backdrop';
import { DIFF_LABEL, FORMAT_LABEL, Format, MatchSetup, loadSetup, saveSetup } from './setup';

const FORMATS: Format[] = ['1v1', '1v2', '2v2'];
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

/** Pick character, 3 items, map, format and bot difficulty. */
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
    menuBackdrop(this);
    const shade = this.add.graphics();
    shade.fillStyle(0x10162a, 0.55);
    shade.fillRect(0, 0, 1920, 1080);
    const ribbon = this.add.graphics({ x: 230, y: 50 });
    drawRibbon(ribbon, 360, 76, THEME.fire, THEME.gold);
    label(this, 230, 46, 'ตู้เสื้อผ้า', 50, '#ffe08a').setOrigin(0.5);
    const wallet = label(this, 1860, 36, '', 30).setOrigin(1, 0);
    const showWallet = () => wallet.setText(account.view ? walletText(account.view.coins, account.view.gems) : '');
    showWallet();
    const stop = account.onChange(showWallet);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);

    this.wardrobe();
    this.itemPicker();
    if (!this.online) this.rightColumn();

    this.hint = label(this, 960, 1040, '', 26, '#ffd166').setOrigin(0.5);
    new Button(this, 200, 990, 260, 90, '← กลับ', { size: 34, onClick: () => this.scene.start(this.returnTo ?? 'menu') });
    // a soft pulsing glow behind the main call to action
    const glow = this.add.graphics({ x: 1640, y: 985 });
    drawPlate(glow, 470, 140, 0x7dff8a, { cut: 30 });
    glow.setAlpha(0.12);
    this.tweens.add({ targets: glow, alpha: 0.38, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    new Button(this, 1640, 985, 440, 110, this.online ? 'ตกลง' : 'เริ่มเล่น!', { fill: THEME.green, size: 48, onClick: () => this.start() });
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
    const bg = this.add.graphics({ x: 690, y: 378 });
    drawPlate(bg, 1260, 540, THEME.panel, { cut: 26, rivets: true });
    bg.lineStyle(2, 0xffffff, 0.06); // faint dividers between looks, the stage, and stats
    bg.lineBetween(-375, -230, -375, 230);
    bg.lineBetween(375, -230, 375, 230);
    this.turntable(540, 350);
    const zoom = 2.6;
    const avatar = this.add.image(540, 470, '__DEFAULT').setOrigin(0.5, 1);
    const hand = this.add.image(578, 425, '__DEFAULT');
    this.refreshers.push(() => {
      const l = this.setup.loadout;
      avatar.setTexture(lookTexture(this, l)).setScale(ART_SCALE * zoom * lookRes());
      const fist = lookHand();
      if (fist) hand.setPosition(540 + fist.x * ART_SCALE * zoom, 470 + fist.y * ART_SCALE * zoom);
      const g = gunLook(this, l.weapon);
      hand.setTexture(g.key).setOrigin(g.ox, g.oy).setScale(g.scale * (fist ? zoom : 1.7)).setRotation(-0.3);
    });
    (['hat', 'glasses'] as const).forEach((k, i) => {
      const btn = new Button(this, 470 + i * 140, 610, 130, 46, k === 'hat' ? 'ซ่อนหมวก' : 'ซ่อนแว่น', {
        size: 20, onClick: () => { this.setup.loadout.hide[k] = !this.setup.loadout.hide[k]; this.refresh(); },
      });
      this.refreshers.push(() => btn.setSelected(this.setup.loadout.hide[k]));
    });

    sectionTab(this, 80, 112, 'แฟชั่น · แค่หน้าตา');
    FASHION_SLOTS.forEach((slot, i) => {
      this.tile(140 + (i % 2) * 120, 200 + Math.floor(i / 2) * 118, FASHION_SLOT_NAME[slot], () => {
        const id = this.setup.loadout.look[slot];
        return { key: pieceTexture(this, slot, id), name: id === 'none' ? '' : fashionDef(slot, id)!.name };
      }, () => this.pickFashion(slot));
    });

    sectionTab(this, 770, 112, 'อุปกรณ์ · ค่าสถานะ');
    EQUIP_SLOTS.forEach((slot, i) => {
      this.tile(820 + (i % 2) * 120, 200 + Math.floor(i / 2) * 118, EQUIP_SLOT_NAME[slot], () => {
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
    const statG = this.add.graphics();
    const statText = STAT_ROWS.map((_, i) => ({
      name: label(this, 770, 452 + i * 38, STAT_NAME[STAT_ROWS[i].k], 20, '#cfd8ff').setOrigin(0, 0.5),
      value: label(this, 975, 452 + i * 38, '', 20).setOrigin(0, 0.5),
    }));
    this.refreshers.push(() => {
      const ts = tankStats(this.setup.loadout);
      const sum = sumStats(this.setup.loadout);
      statG.clear();
      STAT_ROWS.forEach((r, i) => {
        const y = 452 + i * 38;
        const v = r.value(ts);
        const up = sum[r.k] > 0;
        const down = sum[r.k] < 0;
        statG.fillStyle(THEME.ink, 1);
        statG.fillRoundedRect(850, y - 7, 115, 14, 7);
        statG.fillStyle(up ? 0x7dff8a : down ? THEME.red : THEME.fire, 1);
        statG.fillRoundedRect(851, y - 5, Math.max(6, Math.min(1, v / 1.5) * 113), 10, 5);
        statG.fillStyle(0xffffff, 0.5);
        statG.fillRect(850 + 115 * (2 / 3), y - 9, 2, 18); // the 100% mark
        statText[i].value.setText(`${r.text(v)}${sum[r.k] ? ` (${fmt(r.k, sum[r.k])})` : ''}`)
          .setColor(up ? '#7dff8a' : down ? '#ff8a80' : '#ffffff');
      });
    });

    sectionTab(this, 1090, 112, 'อาวุธ', THEME.red);
    this.tile(1190, 230, 'อาวุธหลัก', () => ({ key: gunLook(this, this.setup.loadout.weapon).key, name: WEAPONS[this.setup.loadout.weapon].name }),
      () => this.pickWeapon(), 190);
    const skill = this.add.text(1190, 345, '', {
      fontFamily: FONT, fontSize: '19px', color: '#8ef0ff', align: 'center', wordWrap: { width: 230 }, lineSpacing: 4,
    }).setOrigin(0.5, 0);
    this.refreshers.push(() => {
      const sk = WEAPONS[this.setup.loadout.weapon].skill!;
      skill.setText(`สกิล E: ${SKILLS[sk].name}\n${SKILLS[sk].desc}`);
    });
    this.tile(1130, 570, 'อาวุธรอง', () => ({ key: gunLook(this, 'drill').key, name: 'สว่าน ×2' }), null);
    this.tile(1250, 570, 'พิเศษ', () => ({ key: null, name: '' }), null);
  }

  /** A steel turntable under the character: fire-orange rim, turning tick marks, and a spotlight at the feet. */
  private turntable(x: number, y: number): void {
    const g = this.add.graphics({ x, y });
    g.fillStyle(0xffb347, 0.05); // warm light behind the character
    for (let r = 120; r <= 200; r += 20) g.fillCircle(0, -10, r);
    g.fillStyle(THEME.ink, 0.9);
    g.fillCircle(0, 0, 200);
    g.fillStyle(THEME.steelDark, 0.95);
    g.fillCircle(0, 0, 190);
    g.lineStyle(6, THEME.fire, 0.9);
    g.strokeCircle(0, 0, 190);
    g.lineStyle(2, 0xffffff, 0.12);
    g.strokeCircle(0, 0, 150);
    const ticks = this.add.graphics({ x, y });
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const long = i % 3 === 0;
      ticks.lineStyle(long ? 4 : 2, long ? THEME.fire : 0xffffff, long ? 0.9 : 0.25);
      ticks.lineBetween(Math.cos(a) * 166, Math.sin(a) * 166, Math.cos(a) * (long ? 182 : 176), Math.sin(a) * (long ? 182 : 176));
    }
    // a slow turn keeps the stage alive without pulling the eye off the character
    this.tweens.add({ targets: ticks, angle: 360, duration: 40000, repeat: -1 });
    const spot = this.add.graphics({ x, y: y + 120 });
    spot.fillStyle(THEME.fire, 0.18);
    spot.fillEllipse(0, 0, 300, 60);
    spot.fillStyle(0xffd166, 0.22);
    spot.fillEllipse(0, 0, 180, 34);
  }

  /** A square slot: the piece's picture and name, or the faded slot name when empty. */
  private tile(
    x: number, y: number, slotName: string, current: () => { key: string | null; name: string },
    onClick: (() => void) | null, size = 104,
  ): void {
    const btn = new Button(this, x, y, size, size, '', { radius: 14, onClick: onClick ?? undefined });
    if (!onClick) btn.setAlpha(0.7);
    const img = this.add.image(0, -8, '__DEFAULT');
    const empty = label(this, 0, 0, slotName, 22, '#5d6a8f').setOrigin(0.5);
    const name = label(this, 0, size / 2 - 2, '', 15).setOrigin(0.5, 1);
    btn.add([img, empty, name]);
    this.refreshers.push(() => {
      const c = current();
      img.setVisible(!!c.key);
      empty.setVisible(!c.key);
      name.setText(c.key ? c.name : '');
      if (c.key) {
        img.setTexture(c.key);
        img.setScale((size - 30) / Math.max(img.width, img.height));
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
    const h = 140 + rows * 320;
    const top = 540 - h / 2;
    const panel = add(this.add.graphics({ x: 960, y: top + h / 2 }).setDepth(51));
    drawPlate(panel, w, h, THEME.panel, { cut: 26, rivets: true, selected: true });
    const ribbon = add(this.add.graphics({ x: 960, y: top + 6 }).setDepth(52));
    const tw = Math.min(w - 160, 120 + title.length * 22);
    drawRibbon(ribbon, tw, 64, THEME.fire, THEME.gold);
    add(fit(label(this, 960, top + 2, title, 32, '#ffe08a').setOrigin(0.5), tw - 40, 56).setDepth(53));
    opts.forEach((o, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, opts.length - row * perRow);
      const x = 960 - ((inRow - 1) * 220) / 2 + (i % perRow) * 220;
      const y = top + 260 + row * 320;
      const card = add(new Button(this, x, y, 200, 300, '', {
        radius: 18, onClick: () => {
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
      } else card.add(label(this, 0, -72, '—', 60, '#5d6a8f').setOrigin(0.5));
      card.add(fit(label(this, 0, -6, o.title, 24, o.on ? '#ffd166' : '#ffffff').setOrigin(0.5, 0), 180, 36));
      if (o.lock) card.add(fit(label(this, 0, 140, o.lock, 22, '#ffd166').setOrigin(0.5, 1), 180, 32));
      card.add(fit(this.add.text(0, 34, o.body, {
        fontFamily: FONT, fontSize: '17px', color: '#cfd8ff', align: 'center', wordWrap: { width: 176 }, lineSpacing: -2,
      }).setOrigin(0.5, 0), 180, o.lock ? 72 : 106));
    });
    add(new Button(this, 960 + w / 2 - 40, top + 30, 52, 52, '✕', { size: 26, onClick: () => this.closePicker() }).setDepth(53));
  }

  private closePicker(): void {
    for (const o of this.picker) o.destroy();
    this.picker = [];
  }

  private itemPicker(): void {
    sectionTab(this, 60, 690, 'ไอเท็ม');
    const title = label(this, 200, 690, '', 26).setOrigin(0, 0.5);
    const pips = this.add.graphics();
    ITEM_IDS.forEach((id, i) => {
      const x = 180 + i * 230;
      const card = this.add.graphics({ x, y: 806 });
      drawPlate(card, 222, 186, THEME.steelDark, { cut: 14 });
      const btn = new Button(this, x, 760, 210, 80, ITEMS[id].name, {
        size: 28,
        onClick: () => {
          const s = this.setup.items;
          const at = s.indexOf(id);
          if (at >= 0) s.splice(at, 1);
          else if (s.length < LIMITS.itemsPerMatch) s.push(id);
          else this.say(`เลือกได้ ${LIMITS.itemsPerMatch} ชิ้น กดชิ้นที่เลือกแล้วเพื่อเอาออก`);
          this.refresh();
        },
      });
      btn.setIcon(iconTexture(this, id));
      this.add.text(x, 812, ITEMS[id].desc, {
        fontFamily: FONT, fontSize: '19px', color: '#cfd8ff', align: 'center', wordWrap: { width: 200 },
      }).setOrigin(0.5, 0);
      this.refreshers.push(() => btn.setSelected(this.setup.items.includes(id)));
    });
    this.refreshers.push(() => {
      const n = this.setup.items.length;
      title.setText(`เลือก ${n}/${LIMITS.itemsPerMatch}`).setColor(n === LIMITS.itemsPerMatch ? '#ffd166' : '#ffffff');
      pips.clear();
      for (let i = 0; i < LIMITS.itemsPerMatch; i++) {
        const px = title.x + title.width + 26 + i * 26;
        pips.fillStyle(THEME.ink, 1);
        pips.fillCircle(px, 690, 10);
        pips.fillStyle(i < n ? THEME.fire : THEME.steel, 1);
        pips.fillCircle(px, 690, 7);
      }
    });
  }

  private rightColumn(): void {
    const cx = 1560;
    const panel = this.add.graphics({ x: cx + 4, y: 498 });
    drawPlate(panel, 450, 800, THEME.panel, { cut: 26, rivets: true });
    sectionTab(this, cx - 215, 112, 'ด่าน');
    const mapDesc = label(this, cx, 410, '', 22, '#cfd8ff').setOrigin(0.5, 0);
    MAP_IDS.forEach((id, i) => {
      const btn = new Button(this, cx, 190 + i * 76, 400, 64, MAPS[id].name, {
        size: 30, onClick: () => { this.setup.map = id; this.refresh(); },
      });
      // a strip of the map's painted backdrop on the left of its button
      const art = `art-bg-${id}`;
      if (this.textures.exists(art)) {
        const thumb = this.add.image(-140, 0, art);
        const k = 48 / thumb.height;
        const cropW = 104 / k;
        thumb.setScale(k).setCrop((thumb.width - cropW) / 2, 0, cropW, thumb.height);
        btn.addAt(thumb, 1);
        btn.text.setX(50);
      }
      this.refreshers.push(() => btn.setSelected(this.setup.map === id));
    });
    this.refreshers.push(() => mapDesc.setText(MAPS[this.setup.map].desc));

    sectionTab(this, cx - 215, 465, 'รูปแบบ');
    FORMATS.forEach((f, i) => {
      const btn = new Button(this, cx, 540 + i * 72, 400, 60, FORMAT_LABEL[f], {
        size: 28, onClick: () => { this.setup.format = f; this.refresh(); },
      });
      this.refreshers.push(() => btn.setSelected(this.setup.format === f));
    });

    sectionTab(this, cx - 215, 760, 'ความเก่งของบอท');
    DIFFICULTIES.forEach((d, i) => {
      const btn = new Button(this, cx - 135 + i * 135, 830, 120, 64, DIFF_LABEL[d], {
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
