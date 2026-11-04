import Phaser from 'phaser';
import { ART_SCALE, equipTexture, gunLook, iconTexture, lookHand, lookRes, lookTexture, pieceTexture } from '../art/chibi';
import { ITEMS, ITEM_IDS, LIMITS, MAIN_WEAPONS, SKILLS, WEAPONS } from '../core/data';
import {
  EQUIP_SLOTS, EQUIP_SLOT_NAME, EquipSlot, FASHION_SLOTS, FASHION_SLOT_NAME, FashionSlot, STAT_NAME, Stats,
  equipDef, equipIn, fashionDef, fashionIn, sumStats, tankStats,
} from '../core/gear';
import { MAPS, MAP_IDS } from '../core/Maps';
import { Difficulty } from '../core/BotAI';
import { Button, FONT, INK, confirmBox, fit, label, walletText } from '../ui/widgets';
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
    label(this, 60, 24, 'ตู้เสื้อผ้า', 56, '#ffd166');
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
    new Button(this, 1640, 985, 440, 110, this.online ? 'ตกลง' : 'เริ่มเล่น!', { fill: 0x2f9e44, size: 48, onClick: () => this.start() });
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
    const bg = this.add.graphics();
    bg.fillStyle(INK, 0.85);
    bg.fillRoundedRect(60, 100, 1260, 550, 26);
    this.magicCircle(540, 350);
    const zoom = 2.6;
    const avatar = this.add.image(540, 470, '__DEFAULT').setOrigin(0.5, 1);
    const hand = this.add.image(578, 425, '__DEFAULT');
    this.refreshers.push(() => {
      const l = this.setup.loadout;
      avatar.setTexture(lookTexture(this, l)).setScale(ART_SCALE * zoom * lookRes());
      const fist = lookHand();
      if (fist) hand.setPosition(540 + fist.x * ART_SCALE * zoom, 470 + fist.y * ART_SCALE * zoom);
      const g = gunLook(this, l.weapon);
      hand.setTexture(g.key).setOrigin(g.ox, g.oy).setScale(g.scale * 1.7).setRotation(-0.3);
    });
    (['hat', 'glasses'] as const).forEach((k, i) => {
      const btn = new Button(this, 470 + i * 140, 610, 130, 46, k === 'hat' ? 'ซ่อนหมวก' : 'ซ่อนแว่น', {
        size: 20, onClick: () => { this.setup.loadout.hide[k] = !this.setup.loadout.hide[k]; this.refresh(); },
      });
      this.refreshers.push(() => btn.setSelected(this.setup.loadout.hide[k]));
    });

    label(this, 200, 112, 'แฟชั่น (เปลี่ยนแค่หน้าตา)', 20, '#cfd8ff').setOrigin(0.5, 0);
    FASHION_SLOTS.forEach((slot, i) => {
      this.tile(140 + (i % 2) * 120, 200 + Math.floor(i / 2) * 118, FASHION_SLOT_NAME[slot], () => {
        const id = this.setup.loadout.look[slot];
        return { key: pieceTexture(this, slot, id), name: id === 'none' ? '' : fashionDef(slot, id)!.name };
      }, () => this.pickFashion(slot));
    });

    label(this, 880, 112, 'อุปกรณ์ (ค่าสถานะ)', 20, '#cfd8ff').setOrigin(0.5, 0);
    EQUIP_SLOTS.forEach((slot, i) => {
      this.tile(820 + (i % 2) * 120, 200 + Math.floor(i / 2) * 118, EQUIP_SLOT_NAME[slot], () => {
        const id = this.setup.loadout.equip[slot];
        return { key: equipTexture(this, slot, id), name: id === 'none' ? '' : equipDef(slot, id)!.name };
      }, () => this.pickEquip(slot));
    });
    const stats = this.add.text(770, 440, '', { fontFamily: FONT, fontSize: '22px', color: '#e6ecff', lineSpacing: 8 });
    this.refreshers.push(() => {
      const ts = tankStats(this.setup.loadout);
      const sum = sumStats(this.setup.loadout);
      const line = (k: keyof Stats, value: string) => `${STAT_NAME[k]}  ${value}${sum[k] ? `  (${fmt(k, sum[k])})` : ''}`;
      stats.setText([
        line('hp', `${ts.maxHp}`),
        line('atk', `${Math.round(ts.atk * 100)}%`),
        line('def', `${Math.round((2 - ts.def) * 100)}%`),
        line('move', `${Math.round(ts.move * 100)}%`),
      ].join('\n'));
    });

    label(this, 1190, 112, 'อาวุธ', 20, '#cfd8ff').setOrigin(0.5, 0);
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

  private magicCircle(x: number, y: number): void {
    const g = this.add.graphics().setPosition(x, y);
    g.fillStyle(0x3a2a6b, 0.55);
    g.fillCircle(0, 0, 200);
    g.lineStyle(6, 0xffd166, 0.7);
    g.strokeCircle(0, 0, 190);
    g.lineStyle(2, 0xffd166, 0.5);
    g.strokeCircle(0, 0, 160);
    g.strokeCircle(0, 0, 120);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const px = Math.cos(a) * 175;
      const py = Math.sin(a) * 175;
      g.fillStyle(0xffd166, 0.8);
      g.fillTriangle(px, py - 8, px + 6, py, px, py + 8);
      g.fillTriangle(px, py - 8, px - 6, py, px, py + 8);
    }
    // a slow turn keeps the circle alive without pulling the eye off the chibi
    this.tweens.add({ targets: g, angle: 360, duration: 40000, repeat: -1 });
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
    const w = Math.max(700, opts.length * 220 + 60);
    const panel = add(this.add.graphics().setDepth(51));
    panel.fillStyle(INK, 0.97);
    panel.fillRoundedRect(960 - w / 2, 300, w, 460, 26);
    panel.lineStyle(5, 0xffd166, 1);
    panel.strokeRoundedRect(960 - w / 2, 300, w, 460, 26);
    add(label(this, 960, 318, title, 34, '#ffd166').setOrigin(0.5, 0).setDepth(52));
    opts.forEach((o, i) => {
      const x = 960 - ((opts.length - 1) * 220) / 2 + i * 220;
      const card = add(new Button(this, x, 560, 200, 300, '', {
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
    add(new Button(this, 960 + w / 2 - 40, 330, 52, 52, '✕', { size: 26, onClick: () => this.closePicker() }).setDepth(53));
  }

  private closePicker(): void {
    for (const o of this.picker) o.destroy();
    this.picker = [];
  }

  private itemPicker(): void {
    const title = label(this, 60, 670, '', 34);
    ITEM_IDS.forEach((id, i) => {
      const x = 180 + i * 230;
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
    this.refreshers.push(() => title.setText(`ไอเท็ม (เลือก ${LIMITS.itemsPerMatch}) — เลือกแล้ว ${this.setup.items.length}`));
  }

  private rightColumn(): void {
    const cx = 1560;
    label(this, cx - 200, 110, 'ด่าน', 34);
    const mapDesc = label(this, cx, 410, '', 22, '#cfd8ff').setOrigin(0.5, 0);
    MAP_IDS.forEach((id, i) => {
      const btn = new Button(this, cx, 190 + i * 76, 400, 64, MAPS[id].name, {
        size: 30, onClick: () => { this.setup.map = id; this.refresh(); },
      });
      this.refreshers.push(() => btn.setSelected(this.setup.map === id));
    });
    this.refreshers.push(() => mapDesc.setText(MAPS[this.setup.map].desc));

    label(this, cx - 200, 460, 'รูปแบบ', 34);
    FORMATS.forEach((f, i) => {
      const btn = new Button(this, cx, 540 + i * 72, 400, 60, FORMAT_LABEL[f], {
        size: 28, onClick: () => { this.setup.format = f; this.refresh(); },
      });
      this.refreshers.push(() => btn.setSelected(this.setup.format === f));
    });

    label(this, cx - 200, 740, 'ความเก่งของบอท', 34);
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
