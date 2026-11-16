import Phaser from 'phaser';
import { ART_SCALE, equipTexture, gunLook, lookHand, lookRes, lookTexture, pieceTexture } from '../art/chibi';
import {
  EQUIPMENT, EQUIP_SLOT_NAME, EquipSlot, FASHION, FASHION_SLOTS, FASHION_SLOT_NAME, FashionSlot, Price, STAT_NAME, Stats, copyLoadout,
} from '../core/gear';
import { ItemKind, itemKey, owns, priceOf, priceText } from '../core/shop';
import { account } from '../net/account';
import { FONT, confirmBox, fit, label } from '../ui/widgets';
import { Box, PlateButton, STROKE, filled, fitted, mockupBox, placed, walletBar } from '../ui/plates';
import { loadSetup, saveSetup } from './setup';

type Tab = FashionSlot | 'equip';

interface Piece {
  kind: ItemKind;
  slot: string;
  id: string;
  name: string;
  /** Not sold: only from the Battle Pass. */
  exclusive: boolean;
  price: Price | null;
}

/** Where each piece sits in the designer's 1671x941 mockup (new_ui/black-boom-shop-parts 2/layout.json). */
const box = (b: Box): Box => mockupBox(b, 1671);
const S = (name: string) => `ui-shop/${name}`;
/** Mockup px to canvas px. */
const K = 1920 / 1671;

const TABS: Tab[] = [...FASHION_SLOTS, 'equip'];
const PER_PAGE = 4;
/** The four clothes have painted pictures in the drop; everything else shows its game sprite. */
const PRODUCT_ART: Record<string, string> = { armor: 'product-armor', trench: 'product-trench', ninja: 'product-ninja', vest: 'product-vest' };

const text = (scene: Phaser.Scene, str: string, size: number, color = '#ffffff', stroke = 5) =>
  scene.add.text(0, 0, str, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: STROKE, strokeThickness: stroke });

/**
 * The shop, built to the painted mockup (new_ui/black-boom-shop-parts 2): the character
 * trying on the picked piece at the left with its name, what it does and the buy button;
 * category tabs along the top; four pieces a page on cards, each with its own price button.
 * Tap a card to try it on; tap a price (or the big button) to buy, then wear it.
 */
export default class ShopScene extends Phaser.Scene {
  private tab: Tab = 'cloth';
  private page = 0;
  private picked: Piece | null = null;
  /** Rebuilt on every render: tabs, cards, the preview's name, description and button. */
  private ui: Phaser.GameObjects.GameObject[] = [];
  private avatar!: Phaser.GameObjects.Image;
  private hand!: Phaser.GameObjects.Image;
  private hint!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super('shop');
  }

  create(): void {
    this.ui = [];
    this.selectIn(this.tab);
    const bg = this.add.image(960, 540, S('bg'));
    bg.setScale(Math.max(1920 / bg.width, 1080 / bg.height));
    this.chrome();
    filled(this, S('preview'), box([16, 132, 409, 740]));
    filled(this, S('showcase'), box([50, 171, 345, 387]));
    this.avatar = this.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 1);
    this.hand = this.add.image(0, 0, '__DEFAULT');
    filled(this, S('nameplate'), box([49, 558, 357, 68]));
    placed(this, S('ico-protection'), box([76, 640, 61, 62]));
    filled(this, S('catalog'), box([420, 270, 1240, 545]));
    filled(this, S('crate-left'), box([0, 823, 216, 118])).setDepth(5);
    filled(this, S('crate-right'), box([1261, 762, 410, 179])).setDepth(5);
    this.hint = label(this, 1195, 1000, '', 30, '#ffd166').setOrigin(0.5).setDepth(10);
    const stop = account.onChange(() => this.render());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      stop();
      this.ui = [];
    });
    void account.ensure().then(() => this.render());
    this.render();
  }

  /** Back, the title plate with the shopping bag, wallet and settings. */
  private chrome(): void {
    const back = new PlateButton(this, 'ui-ranked/btn-back', box([21, 18, 91, 77]), () => this.scene.start('menu'));
    back.put(fitted(this, 'ui-ranked/ico-back', back.w * 0.52, back.h * 0.56), 0.5, 0.5);
    filled(this, S('header'), box([145, 24, 496, 87]));
    placed(this, S('logo'), box([142, 17, 170, 96]));
    placed(this, S('ico-bag'), box([331, 14, 75, 84]));
    const [tx, ty, tw, th] = box([409, 30, 166, 62]);
    fit(text(this, 'ร้านค้า', 56, '#ffffff', 8).setOrigin(0, 0.5).setPosition(tx, ty + th / 2), tw, th);
    walletBar(this);
  }

  private say(msg: string): void {
    this.hint.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.hint);
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 2500, duration: 400 });
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.ui.push(o);
    return o;
  }

  // ---------------------------------------------------------------- data

  private pieces(tab: Tab): Piece[] {
    if (tab === 'equip') {
      return EQUIPMENT.filter((e) => e.price).map((e) => ({
        kind: 'equip' as const, slot: e.slot, id: e.id, name: e.name, exclusive: false, price: e.price ?? null,
      }));
    }
    return FASHION.filter((f) => f.slot === tab && (f.price || f.exclusive)).map((f) => ({
      kind: 'fashion' as const, slot: f.slot, id: f.id, name: f.name, exclusive: !!f.exclusive, price: priceOf('fashion', f.slot, f.id),
    }));
  }

  /** Open a tab on the piece being worn from it (or its first), on that piece's page. */
  private selectIn(tab: Tab): void {
    this.tab = tab;
    const list = this.pieces(tab);
    const l = loadSetup(this.registry).loadout;
    const at = Math.max(0, list.findIndex((p) => this.wearing(p, l)));
    this.picked = list[at] ?? null;
    this.page = Math.floor(at / PER_PAGE);
  }

  private wearing(p: Piece, l = loadSetup(this.registry).loadout): boolean {
    return p.kind === 'fashion' ? l.look[p.slot as FashionSlot] === p.id : l.equip[p.slot as EquipSlot] === p.id;
  }

  private has(p: Piece): boolean {
    return owns(account.owned(), p.kind, p.slot, p.id);
  }

  private same(a: Piece | null, b: Piece): boolean {
    return !!a && a.kind === b.kind && a.slot === b.slot && a.id === b.id;
  }

  private picture(p: Piece): string | null {
    if (p.kind === 'fashion' && p.slot === 'cloth' && PRODUCT_ART[p.id]) return S(PRODUCT_ART[p.id]);
    return p.kind === 'fashion' ? pieceTexture(this, p.slot as FashionSlot, p.id) : equipTexture(this, p.slot as EquipSlot, p.id);
  }

  /** What the piece does, two short lines under its name. */
  private describe(p: Piece): string {
    if (p.exclusive) return 'ได้จาก Battle Pass เท่านั้น\nไม่ขายในร้าน';
    if (p.kind === 'fashion') return `${FASHION_SLOT_NAME[p.slot as FashionSlot]} · แค่หน้าตา\nไม่มีผลกับค่าสถานะ`;
    const stats = EQUIPMENT.find((e) => e.slot === p.slot && e.id === p.id)!.stats;
    const parts = (Object.keys(stats) as (keyof Stats)[]).map((k) => `${STAT_NAME[k]} ${fmt(k, stats[k]!)}`);
    return `${EQUIP_SLOT_NAME[p.slot as EquipSlot]}\n${parts.join('  ')}`;
  }

  // ---------------------------------------------------------------- actions

  private wear(p: Piece): void {
    const setup = loadSetup(this.registry);
    if (p.kind === 'fashion') setup.loadout.look[p.slot as FashionSlot] = p.id;
    else setup.loadout.equip[p.slot as EquipSlot] = p.id;
    saveSetup(this.registry, setup);
    this.say(`ใส่ ${p.name} แล้ว`);
    this.render();
  }

  /** The price button / big button: wear it if owned, otherwise offer to buy it. */
  private act(p: Piece): void {
    this.picked = p;
    if (this.has(p)) {
      if (!this.wearing(p)) this.wear(p);
      else this.render();
      return;
    }
    this.render();
    if (!p.price) return this.say('ชิ้นนี้ได้จาก Battle Pass เท่านั้น');
    if (!account.view) return this.say('ต้องต่อเซิร์ฟเวอร์ก่อนถึงจะซื้อได้');
    if (this.busy) return;
    const price = p.price;
    confirmBox(this, `ซื้อ ${p.name}\n${priceText(price)}`, 'ซื้อ', () => {
      this.busy = true;
      account.buy(itemKey(p.kind, p.slot, p.id))
        .then(() => this.say(`ได้ ${p.name} แล้ว กดใส่เลยได้`))
        .catch((err: Error) => this.say(err.message))
        .finally(() => {
          this.busy = false;
        });
    });
  }

  // ---------------------------------------------------------------- drawing

  private render(): void {
    if (!this.sys.isActive()) return;
    for (const o of this.ui) o.destroy();
    this.ui = [];
    this.tabs();
    this.catalog();
    this.preview();
  }

  /** The nine categories: navy plates, the open one gold, taller and flagged. */
  private tabs(): void {
    TABS.forEach((t, i) => {
      const on = t === this.tab;
      const x = 445 + i * 133;
      const b = new PlateButton(this, S(on ? 'tab-on' : 'tab'), box(on ? [x, 133, 136, 131] : [x, 145, 136, 111]), () => {
        if (on) return;
        this.selectIn(t);
        this.render();
      });
      b.put(fitted(this, S(`ico-${t}`), b.w * 0.42, b.h * 0.34), 0.5, on ? 0.37 : 0.36);
      b.put(fit(text(this, t === 'equip' ? 'อุปกรณ์' : FASHION_SLOT_NAME[t], 30, '#ffffff', 6).setOrigin(0.5), b.w * 0.84, b.h * 0.3), 0.5, on ? 0.68 : 0.7);
      this.keep(b);
      if (on) this.keep(placed(this, S('emphasis'), box([x - 47, 94, 66, 55])));
    });
  }

  /** This page's cards, and the page arrows when the category has more than four. */
  private catalog(): void {
    const list = this.pieces(this.tab);
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    const shown = list.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE);
    // fewer than four: keep them centred on the panel
    const x0 = 477 + ((PER_PAGE - shown.length) * 287) / 2;
    shown.forEach((p, i) => this.card(p, x0 + i * 287));
    if (!list.length) this.keep(text(this, 'ไม่มีของขายในหมวดนี้', 36).setOrigin(0.5).setPosition(1195, 620));
    if (pages > 1) this.pager(pages);
  }

  private card(p: Piece, mx: number): void {
    const on = this.same(this.picked, p);
    const cb = box([mx, 343, 273, 395]);
    const card = this.keep(new PlateButton(this, S('card'), cb, () => {
      this.picked = p;
      this.render();
    }));
    const key = this.picture(p);
    if (key) {
      const img = this.add.image(0, 0, key);
      img.setScale(Math.min((card.w * 0.74) / img.width, (180 * K) / img.height));
      card.putAt(img, card.w / 2, 125 * K);
    }
    card.putAt(fit(text(this, p.name, 36, '#ffffff', 6).setOrigin(0.5), 245 * K, 55 * K), card.w / 2, 245 * K);
    if (on) {
      const [x, y, w, h] = cb;
      this.keep(this.add.image(x + w / 2, y + h / 2, S('card-on')).setDisplaySize(w + 14, h + 14));
      this.keep(placed(this, S('emphasis'), box([mx - 26, 300, 70, 60])));
      this.keep(placed(this, S('check'), box([mx + 202, 330, 76, 76])));
    }
    this.keep(this.priceButton(p, box([mx + 21, 633, 232, 78]), 34));
  }

  /**
   * A price plate: gold for coins, purple for gems, with the coin or gem and the amount.
   * Owned pieces say so (and wear on tap); Battle Pass pieces say where they come from.
   */
  private priceButton(p: Piece, b: Box, size: number, big = false): PlateButton {
    const has = this.has(p);
    const worn = has && this.wearing(p);
    const gems = !has && !!p.price?.gems;
    const btn = new PlateButton(this, S(gems || (p.exclusive && !has) ? 'price-gems' : 'price-coins'), b, () => this.act(p));
    let words: string;
    let icon: string | null = null;
    if (worn) words = 'ใส่อยู่';
    else if (has) words = big ? 'ใส่เลย' : 'มีแล้ว · ใส่';
    else if (!p.price) words = 'Battle Pass';
    else {
      words = `${big ? 'ซื้อ ' : ''}${priceText(p.price)}`;
      icon = p.price.gems ? 'ui-ico-gem' : big ? S('ico-coin-stack') : 'ui-ico-coin';
    }
    if (worn) btn.base.setTint(0x9aa0b8);
    // icon at the left end, the words centred in what is left of the plate
    const iw = icon ? btn.h * (big ? 0.88 : 0.6) : 0;
    const ix = big ? 0.17 : 0.15;
    if (icon) btn.put(fitted(this, icon, iw, iw), ix, 0.5);
    const left = icon ? ix + iw / btn.w / 2 + 0.03 : 0.08;
    const t = fit(text(this, words, size, '#ffffff', 6).setOrigin(0.5), btn.w * (0.92 - left), btn.h * 0.62);
    btn.put(t, (left + 0.92) / 2, 0.48);
    return btn;
  }

  /** ‹ 1/2 › under the cards. */
  private pager(pages: number): void {
    const turn = (d: number) => {
      this.page = (this.page + d + pages) % pages;
      this.render();
    };
    const prev = this.keep(new PlateButton(this, 'ui-ranked/btn-back', box([945, 748, 62, 54]), () => turn(-1)));
    prev.put(fitted(this, 'ui-ranked/ico-back', prev.w * 0.5, prev.h * 0.5), 0.5, 0.5);
    const next = this.keep(new PlateButton(this, 'ui-ranked/btn-back', box([1073, 748, 62, 54]), () => turn(1)));
    next.put(fitted(this, 'ui-ranked/ico-back', next.w * 0.5, next.h * 0.5).setFlipX(true), 0.5, 0.5);
    const [cx, cy, , ch] = box([1007, 748, 66, 54]);
    this.keep(text(this, `${this.page + 1}/${pages}`, 30).setOrigin(0.5).setPosition(cx + (66 * K) / 2, cy + ch / 2));
  }

  /** The character trying on the picked piece, its name, what it does and the big button. */
  private preview(): void {
    const setup = loadSetup(this.registry);
    const look = copyLoadout(setup.loadout);
    const p = this.picked;
    if (p?.kind === 'fashion') look.look[p.slot as FashionSlot] = p.id;
    const [ax, ay, aw, ah] = box([136, 238, 188, 292]);
    const feet = ay + ah;
    const cx = ax + aw / 2 - 10;
    const zoom = 4.2;
    this.avatar.setTexture(lookTexture(this, look)).setPosition(cx, feet).setScale(ART_SCALE * zoom * lookRes());
    const fist = lookHand();
    const g = gunLook(this, look.weapon);
    this.hand.setTexture(g.key).setOrigin(g.ox, g.oy).setScale(g.scale * (fist ? zoom : 1.7)).setRotation(-0.3)
      .setPosition(fist ? cx + fist.x * ART_SCALE * zoom : cx + 44, fist ? feet + fist.y * ART_SCALE * zoom : feet - 70);

    const [nx, ny, nw, nh] = box([80, 565, 296, 53]);
    const [dx, dy, dw, dh] = box([146, 640, 240, 61]);
    if (!p) {
      this.keep(fit(text(this, 'เลือกของเพื่อลองใส่', 34, '#ffffff', 6).setOrigin(0.5).setPosition(nx + nw / 2, ny + nh / 2), nw, nh));
      return;
    }
    this.keep(fit(text(this, p.name, 40, '#ffffff', 6).setOrigin(0.5).setPosition(nx + nw / 2, ny + nh / 2), nw, nh));
    this.keep(fit(this.add.text(dx, dy + dh / 2, this.describe(p), {
      fontFamily: FONT, fontSize: '23px', color: '#d4d7e5', lineSpacing: -2,
    }).setOrigin(0, 0.5), dw + 20, dh + 10));
    this.keep(this.priceButton(p, box([54, 724, 350, 99]), 42, true));
  }
}

function fmt(k: keyof Stats, v: number): string {
  const sign = v > 0 ? '+' : '';
  return k === 'hp' ? `${sign}${v}` : `${sign}${v}%`;
}
