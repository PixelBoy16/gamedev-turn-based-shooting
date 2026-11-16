import Phaser from 'phaser';
import { Price } from '../core/gear';
import { Box, PlateButton, STROKE } from './plates';
import { FONT, fit } from './widgets';

// The pop-up windows, built from the designer's painted mockup (new_ui/black-boom-modal-parts 2,
// 1672×941): a confirm window (made for unlocking the Battle Pass, also used to buy a piece) and a
// card picker (made for choosing a face, used for every wardrobe slot).

const K = 1920 / 1672;
const M = (name: string) => `ui-modal/${name}`;
const DEPTH = 60;

const text = (scene: Phaser.Scene, str: string, size: number, color = '#ffffff', stroke = 4) =>
  scene.add.text(0, 0, str, {
    fontFamily: FONT, fontSize: `${Math.round(size * K)}px`, fontStyle: 'bold', color,
    stroke: STROKE, strokeThickness: Math.round(stroke * K * 1.5), padding: { x: 4, y: 6 },
  });

/** An image stretched over a box given in container px. */
const fill = (scene: Phaser.Scene, key: string, [x, y, w, h]: Box) => scene.add.image(x + w / 2, y + h / 2, key).setDisplaySize(w, h);
/** An image fitted (keeping its shape) in a box given in container px. */
const fitIn = (scene: Phaser.Scene, key: string, [x, y, w, h]: Box) => {
  const img = scene.add.image(x + w / 2, y + h / 2, key);
  return img.setScale(Math.min(w / img.width, h / img.height));
};

/** The dark layer behind a window: swallows taps, and a tap on it closes the window. */
function dimmer(scene: Phaser.Scene, close: () => void): Phaser.GameObjects.Rectangle {
  const dim = scene.add.rectangle(960, 540, 1920, 1080, 0x05060a, 0.74).setInteractive().setDepth(DEPTH).setAlpha(0);
  scene.tweens.add({ targets: dim, alpha: 1, duration: 160 });
  dim.on('pointerup', close);
  return dim;
}

/** Grow the window in from slightly small. */
function popIn(scene: Phaser.Scene, c: Phaser.GameObjects.Container): void {
  c.setScale(0.86).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 200, ease: 'Back.easeOut' });
}

/** The amount and currency of a price, the cheaper way it can be paid first. */
function cost(p: Price): { amount: number; gems: boolean } {
  return p.coins !== undefined ? { amount: p.coins, gems: false } : { amount: p.gems ?? 0, gems: true };
}

export interface OfferOpts {
  /** Top line, e.g. "ปลดล็อก Battle Pass" / "ซื้อชิ้นนี้". */
  title: string;
  /** The name on the yellow banner, e.g. "พรีเมียม" or the piece's name. */
  tag: string;
  /** One short line under the banner. */
  about: string;
  /** The picture on the left; the premium ticket when left out. */
  art?: string;
  price: Price;
  /** The confirm button's word. */
  yes: string;
  onYes: () => void;
  /** The ticket crest over the top edge (the Battle Pass). */
  crest?: boolean;
}

/** A confirm window: picture, title, banner, price, and cancel / confirm. Returns its closer. */
export function offerBox(scene: Phaser.Scene, o: OfferOpts): () => void {
  // mockup px → px from the window's centre (the painted panel is [318, 36, 1043, 402])
  const at = ([x, y, w, h]: Box): Box => [(x - 839.5) * K, (y - 237) * K, w * K, h * K];
  const parts: Phaser.GameObjects.GameObject[] = [];
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    for (const p of parts) p.destroy();
  };
  parts.push(dimmer(scene, close));
  const c = scene.add.container(960, 520).setDepth(DEPTH + 1);
  parts.push(c);

  c.add(fill(scene, M('panel-offer'), at([318, 36, 1043, 402])));
  const glow = fill(scene, M('glow'), at([350, 49, 282, 291]));
  scene.tweens.add({ targets: glow, alpha: 0.6, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  c.add(glow);
  const art = fitIn(scene, o.art ?? M('ticket'), at(o.art ? [392, 110, 200, 200] : [377, 130, 230, 173]));
  scene.tweens.add({ targets: art, scale: art.scale * 1.05, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  c.add(art);
  for (const [b, delay] of [[[546, 84, 40, 44], 0], [[351, 240, 36, 40], 700]] as [Box, number][]) {
    const s = fitIn(scene, M('sparkle'), at(b));
    scene.tweens.add({ targets: s, scale: s.scale * 0.55, alpha: 0.5, duration: 700, yoyo: true, repeat: -1, delay, ease: 'Sine.easeInOut' });
    c.add(s);
  }
  if (o.crest) {
    c.add(fitIn(scene, M('emphasis'), at([697, 39, 37, 63])).setFlipX(true));
    c.add(fitIn(scene, M('ticket'), at([733, 7, 146, 111])));
    c.add(fitIn(scene, M('emphasis'), at([876, 5, 61, 94])));
  }

  const put = (t: Phaser.GameObjects.Text, b: Box, align: 'start' | 'center' = 'center') => {
    const [x, y, w, h] = at(b);
    t.setOrigin(align === 'center' ? 0.5 : 0, 0.5).setPosition(align === 'center' ? x + w / 2 : x, y + h / 2);
    c.add(fit(t, w, h * 1.3));
    return t;
  };
  put(text(scene, o.title, 42, '#ffffff', 4), [611, 114, 423, 57]);
  c.add(fill(scene, M('banner'), at([664, 164, 324, 86])));
  put(text(scene, o.tag, 51, '#101529', 0), [702, 173, 258, 62]);
  put(text(scene, o.about, 28, '#b8c6ef', 0), [618, 256, 412, 38]);

  // the price: plate, coin or gem, the number and its unit flowing on from it
  const { amount, gems } = cost(o.price);
  c.add(fill(scene, M('price-plate'), at([1020, 154, 309, 105])));
  c.add(fitIn(scene, M(gems ? 'gems' : 'coins'), at([1046, 175, 74, 64])));
  const [nx, ny, nw, nh] = at([1127, 177, 186, 60]);
  const num = fit(text(scene, amount.toLocaleString('en-US'), 53, '#ffffff', 4).setOrigin(0, 0.5).setPosition(nx, ny + nh / 2), nw * 0.66, nh * 1.2);
  const unit = text(scene, gems ? 'เพชร' : 'เหรียญ', 31, '#ffffff', 3).setOrigin(0, 0.5);
  unit.setPosition(num.x + num.displayWidth + 2, ny + nh / 2 + 6 * K);
  fit(unit, nx + nw - unit.x, nh);
  c.add([num, unit]);

  const button = (key: string, b: Box, word: string, onClick: () => void) => {
    const [x, y, w, h] = at(b);
    const btn = new PlateButton(scene, M(key), [x, y, w, h], onClick, [0, 0, 1, 1]);
    btn.put(fit(text(scene, word, 38, '#ffffff', 4).setOrigin(0.5), btn.w * 0.8, btn.h * 0.66), 0.5, 0.48);
    c.add(btn);
    return btn;
  };
  button('btn-cancel', [510, 305, 310, 97], 'ยกเลิก', close);
  button('btn-confirm', [841, 305, 339, 97], o.yes, () => {
    close();
    o.onYes();
  });
  popIn(scene, c);
  return close;
}

export interface PickCard {
  /** Its picture; null shows a dash ("none"). */
  key: string | null;
  name: string;
  /** Small print under the name: stats, what a weapon does. */
  body?: string;
  /** Worn now: the gold frame and the tick. */
  on: boolean;
  /** Not owned yet: what it costs, or 'pass' for Battle Pass only. */
  price?: Price | 'pass';
  onTap: () => void;
}

export interface PickerOpts {
  title: string;
  /** Grey note beside the title, e.g. "(ไม่มีผลกับค่าสถานะ)". */
  hint?: string;
  /** Icon on the title tab. */
  icon: string;
  cards: PickCard[];
}

/** A window of cards to choose from, up to five a row. Tapping a card closes it, then runs the card's onTap. Returns its closer. */
export function pickerBox(scene: Phaser.Scene, o: PickerOpts): () => void {
  const parts: Phaser.GameObjects.GameObject[] = [];
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    for (const p of parts) p.destroy();
  };
  parts.push(dimmer(scene, close));

  const n = o.cards.length;
  const perRow = Math.min(5, n);
  const rows = Math.ceil(n / perRow);
  const tall = o.cards.some((p) => p.body);
  const cw = Math.round(263 * K);
  const priced = o.cards.some((p) => p.price);
  const ch = Math.round((tall ? (priced ? 340 : 290) : 284) * K);
  const gap = Math.round(10 * K);
  const sideX = Math.round(73 * K);
  const topY = Math.round(99 * K);
  const botY = Math.round(58 * K);
  const pw = Math.max(Math.round(900 * K), perRow * cw + (perRow - 1) * gap + sideX * 2);
  const ph = topY + rows * ch + (rows - 1) * gap * 2 + botY;
  // the painted panel, nine-sliced so its riveted corners and stripes keep their size
  const c = scene.add.container(960, 540 + 20).setDepth(DEPTH + 1);
  parts.push(c);
  const panelK = 1218 * K / 1400;
  const panel = scene.add.nineslice(0, 0, M('panel-pick'), undefined, pw / panelK, ph / panelK, 170, 170, 120, 120).setScale(panelK);
  c.add(panel);
  const left = -pw / 2;
  const top = -ph / 2;

  // title tab, its icon and the note beside it
  const title = fit(text(scene, o.title, 45, '#ffffff', 4), 420, 64);
  const tabW = Math.max(334 * K, title.displayWidth + 150 * K);
  const tabX = left + 22 * K;
  const tabY = top - 14 * K;
  if (o.hint) {
    const hint = fit(text(scene, o.hint, 28, '#aebee8', 0), 300 * K, 40 * K);
    const hw = hint.displayWidth + 70 * K;
    c.add(fill(scene, M('hint'), [tabX + tabW - 22 * K, top + 1 * K, hw, 62 * K]));
    c.add(hint.setOrigin(0, 0.5).setPosition(tabX + tabW + 18 * K, top + 32 * K));
  }
  c.add(fill(scene, M('tab'), [tabX, tabY, tabW, 90 * K]));
  c.add(fitIn(scene, o.icon, [tabX + 51 * K, tabY + 7 * K, 70 * K, 68 * K]));
  c.add(title.setOrigin(0, 0.5).setPosition(tabX + 139 * K, tabY + 43 * K));
  const x = new PlateButton(scene, M('btn-close'), [left + pw - (41 + 94) * K, top - 18 * K, 94 * K, 94 * K], close);
  x.put(fitted(scene, M('x'), x.w * 0.5, x.h * 0.5), 0.5, 0.5);
  c.add(x);

  o.cards.forEach((p, i) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, n - row * perRow);
    const rowW = inRow * cw + (inRow - 1) * gap;
    const cx = -rowW / 2 + (i % perRow) * (cw + gap);
    const cy = top + topY + row * (ch + gap * 2);
    c.add(card(scene, p, [cx, cy, cw, ch], tall, priced, () => {
      close();
      p.onTap();
    }));
  });
  popIn(scene, c);
  return close;
}

function fitted(scene: Phaser.Scene, key: string, w: number, h: number): Phaser.GameObjects.Image {
  const img = scene.add.image(0, 0, key);
  return img.setScale(Math.min(w / img.width, h / img.height));
}

/** One card of the picker: picture, name, small print, and its price when it isn't owned. */
function card(scene: Phaser.Scene, p: PickCard, [x, y, w, h]: Box, tall: boolean, priced: boolean, onTap: () => void): PlateButton {
  const btn = new PlateButton(scene, M('card'), [x, y, w, h], onTap, [0, 0, 1, 1]);
  // vertical bands, as fractions of the card: picture, name, small print, price
  const band = tall && !priced
    ? { pic: [0.05, 0.36], name: [0.43, 0.14], body: [0.58, 0.36], price: [0.77, 0.19] }
    : tall
    ? { pic: [0.05, 0.3], name: [0.34, 0.12], body: [0.47, p.price ? 0.27 : 0.45], price: [0.77, 0.19] }
    : { pic: [0.08, 0.43], name: [0.53, 0.18], body: [0.71, 0.05], price: [0.73, 0.23] };
  const [py, phh] = band.pic;
  if (p.key) btn.putAt(fitted(scene, p.key, w * 0.62, h * phh), w / 2, h * (py + phh / 2));
  else btn.putAt(fitted(scene, M('none'), w * 0.3, h * phh * 0.4), w / 2, h * (py + phh / 2));
  const [ny, nh] = band.name;
  btn.putAt(fit(text(scene, p.name, 36, p.on ? '#ffe158' : '#ffffff', 4).setOrigin(0.5), w * 0.88, h * nh), w / 2, h * (ny + nh / 2));
  if (p.body) {
    const [by, bh] = band.body;
    const t = scene.add.text(0, 0, p.body, {
      fontFamily: FONT, fontSize: '19px', color: '#cfd8ff', align: 'center', wordWrap: { width: w * 0.86 }, lineSpacing: -2,
    }).setOrigin(0.5, 0);
    btn.putAt(fit(t, w * 0.88, h * bh), w / 2, h * by);
  }
  if (p.price) {
    const [ry, rh] = band.price;
    const pw = w * 0.84;
    const plate = scene.add.image(0, 0, M('btn-price')).setDisplaySize(pw, h * rh);
    btn.putAt(plate, w / 2, h * (ry + rh / 2));
    const pass = p.price === 'pass';
    const { amount, gems } = pass ? { amount: 0, gems: false } : cost(p.price as Price);
    const icon = fitted(scene, pass ? M('ticket') : M(gems ? 'gems' : 'coins'), pw * 0.2, h * rh * 0.62);
    const words = fit(text(scene, pass ? 'Battle Pass' : `${amount.toLocaleString('en-US')} ${gems ? 'เพชร' : 'เหรียญ'}`, 28, '#ffffff', 3)
      .setOrigin(0, 0.5), pw * 0.66, h * rh * 0.8);
    const total = icon.displayWidth + 6 + words.displayWidth;
    const lx = (w - total) / 2;
    btn.putAt(icon, lx + icon.displayWidth / 2, h * (ry + rh / 2));
    btn.putAt(words, lx + icon.displayWidth + 6, h * (ry + rh / 2));
  }
  if (p.on) {
    const sel = scene.add.image(0, 0, M('selection')).setDisplaySize(w * 1.08, h * 1.06);
    btn.putAt(sel, w * 0.5, h * 0.5);
    btn.putAt(fitted(scene, M('check'), w * 0.26, h * 0.24), w * 0.88, h * 0.08);
  }
  return btn;
}
