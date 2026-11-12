import Phaser from 'phaser';
import { isMuted, setMuted, sfx } from '../audio/sfx';
import { account } from '../net/account';
import { THEME, drawPlate } from './theme';
import { Button, FONT, fit } from './widgets';

// Pieces shared by the screens built from the designer's painted mockups (public/art/ui/,
// made by tools/prepare_menu_ui.py): a painted plate that is a button, and the wallet and
// settings gear along the top right.

/** A rect as [x, y, w, h]. */
export type Box = [number, number, number, number];
/** Where a plate's painted face is inside its image, as [left, top, right, bottom] fractions. */
export type Face = [number, number, number, number];
export const FULL: Face = [0, 0, 1, 1];

/** Dark navy outline used on all text over the painted plates. */
export const STROKE = '#091024';

/** A box measured on a mockup `mockupW` px wide, scaled to the 1920 canvas. */
export function mockupBox(b: Box, mockupW: number): Box {
  const k = 1920 / mockupW;
  return b.map((v) => Math.round(v * k)) as Box;
}

/** An image at 0,0 scaled to fit w×h. */
export function fitted(scene: Phaser.Scene, key: string, w: number, h: number): Phaser.GameObjects.Image {
  const img = scene.add.image(0, 0, key);
  return img.setScale(Math.min(w / img.width, h / img.height));
}

/** An image fitted inside a box (keeping its shape), centred on it. */
export function placed(scene: Phaser.Scene, key: string, [x, y, w, h]: Box): Phaser.GameObjects.Image {
  const img = scene.add.image(x + w / 2, y + h / 2, key);
  return img.setScale(Math.min(w / img.width, h / img.height));
}

/** An image stretched to fill a box exactly (a mockup's "fill" pieces: plates, strips, glows). */
export function filled(scene: Phaser.Scene, key: string, [x, y, w, h]: Box): Phaser.GameObjects.Image {
  return scene.add.image(x + w / 2, y + h / 2, key).setDisplaySize(w, h);
}

/**
 * A painted plate that is a button: the image scaled so its painted face (`face`, fractions
 * of the image) fills the box, a hit zone the size of that face, a lift on hover and a sink
 * when pressed. Children go in its local space (centre of the face at 0,0); `put` places them
 * by fractions of the face, `putAt` by px from its top-left.
 */
export class PlateButton extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly base: Phaser.GameObjects.Image;
  /** False: dimmed and ignores taps. */
  enabled = true;
  onClick: () => void;

  constructor(scene: Phaser.Scene, key: string, [x, y, bw, bh]: Box, onClick: () => void, face: Face = FULL) {
    super(scene, x + bw / 2, y + bh / 2);
    this.onClick = onClick;
    this.base = scene.add.image(0, 0, key);
    const [l, t, r, b] = face;
    const sx = bw / (this.base.width * (r - l));
    const sy = bh / (this.base.height * (b - t));
    // one scale when the box has the face's shape (the column does); a fitted box keeps it too
    const s = face === FULL ? Math.min(sx, sy) : sx;
    this.base.setScale(s, face === FULL ? s : sy);
    this.base.setPosition((0.5 - (l + r) / 2) * this.base.displayWidth, (0.5 - (t + b) / 2) * this.base.displayHeight);
    this.w = this.base.displayWidth * (r - l);
    this.h = this.base.displayHeight * (b - t);
    const zone = scene.add.zone(0, 0, this.w, this.h).setInteractive({ useHandCursor: true });
    this.add([this.base, zone]);
    scene.add.existing(this);
    let held = false;
    zone.on('pointerdown', () => {
      if (!this.enabled) return;
      held = true;
      this.setScale(0.96);
      sfx.click();
    });
    zone.on('pointerout', () => {
      held = false;
      this.setScale(1);
    });
    zone.on('pointerup', () => {
      if (!held) return;
      held = false;
      this.setScale(1);
      this.onClick();
    });
    zone.on('pointerover', () => {
      if (this.enabled) this.setScale(1.03);
    });
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    return this.setAlpha(on ? 1 : 0.55);
  }

  /** Add `o` with its origin at (fx, fy) of the face, 0..1 from the top-left. */
  put(o: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, fx: number, fy: number): this {
    return this.putAt(o, fx * this.w, fy * this.h);
  }

  /** Add `o` with its origin `px`, `py` from the face's top-left. */
  putAt(o: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, px: number, py: number): this {
    o.setPosition(-this.w / 2 + px, -this.h / 2 + py);
    this.add(o);
    return this;
  }

  /** Every few seconds the plate flashes brighter, in its own silhouette (an additive copy of it fades up and out). */
  glint(delay: number): void {
    const b = this.base;
    const flash = this.scene.add.image(b.x, b.y, b.texture.key).setScale(b.scaleX, b.scaleY).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.addAt(flash, 1);
    this.scene.tweens.add({ targets: flash, alpha: 0.28, duration: 260, yoyo: true, delay, repeatDelay: 4200, repeat: -1, ease: 'Sine.easeInOut' });
  }
}

/** Coins, gems and the settings gear along the top right, kept in step with the account. Same place on every screen. */
export function walletBar(scene: Phaser.Scene): void {
  const box = (b: Box) => mockupBox(b, 1672);
  const coins = counter(scene, 'coins', box([1068, 24, 242, 65]));
  const gems = counter(scene, 'gems', box([1323, 25, 235, 65]));
  let close: (() => void) | undefined;
  const gear: PlateButton = new PlateButton(scene, 'ui-btn-settings', box([1572, 19, 84, 77]), () => {
    if (close) close();
    else close = settingsPanel(scene, gear, () => (close = undefined));
  });
  gear.put(fitted(scene, 'ui-ico-settings', gear.w * 0.6, gear.h * 0.6), 0.5, 0.5);
  const show = () => {
    const a = account.view;
    coins(a ? a.coins : null);
    gems(a ? a.gems : null);
  };
  show();
  const stop = account.onChange(show);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
}

/** A painted wallet bar with its icon and a + that opens the shop; returns the setter for its number. */
function counter(scene: Phaser.Scene, kind: 'coins' | 'gems', [x, y, w, h]: Box): (n: number | null) => void {
  const bar = scene.add.image(x + w / 2, y + h / 2, `ui-cur-${kind}`);
  bar.setScale(Math.min(w / bar.width, h / bar.height));
  const bw = bar.displayWidth;
  const bh = bar.displayHeight;
  const at = (fx: number) => bar.x - bw / 2 + fx * bw;
  const icon = scene.add.image(at(kind === 'coins' ? 0.155 : 0.16), bar.y, `ui-ico-${kind === 'coins' ? 'coin' : 'gem'}`);
  icon.setScale(Math.min((bw * 0.23) / icon.width, (bh * 0.85) / icon.height));
  const value = scene.add.text(at(0.52), bar.y, '', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 4 }).setOrigin(0.5);
  const plus = new PlateButton(scene, 'ui-plus', [at(0.78), bar.y - bh * 0.35, bw * 0.17, bh * 0.7], () => scene.scene.start('shop'));
  plus.setDepth(1);
  return (n) => {
    value.setText(n === null ? '–' : n.toLocaleString('en-US'));
    fit(value.setScale(1), bw * 0.46, bh * 0.8);
  };
}

/** A small panel under the gear: sound on/off and the account screen. Tap outside to close. Returns its closer. */
function settingsPanel(scene: Phaser.Scene, gear: PlateButton, onClose: () => void): () => void {
  const x = gear.x - 150 + gear.w / 2;
  const y = gear.y + gear.h / 2 + 110;
  const shield = scene.add.zone(960, 540, 1920, 1080).setInteractive().setDepth(20);
  const panel = scene.add.graphics({ x, y }).setDepth(21);
  drawPlate(panel, 300, 190, THEME.steelDark, { cut: 14 });
  const soundLabel = () => (isMuted() ? 'เสียง: ปิด' : 'เสียง: เปิด');
  const sound: Button = new Button(scene, x, y - 42, 260, 64, soundLabel(), {
    size: 26,
    onClick: () => {
      setMuted(!isMuted());
      sound.text.setText(soundLabel());
    },
  }).setDepth(22);
  const acct = new Button(scene, x, y + 42, 260, 64, 'บัญชีผู้เล่น', { size: 26, onClick: () => scene.scene.start('account') }).setDepth(22);
  const close = () => {
    for (const o of [shield, panel, sound, acct]) o.destroy();
    onClose();
  };
  shield.on('pointerdown', close);
  return close;
}

// ------------------------------------------------------------------ theme kit
// For screens with no mockup of their own: the painted pieces nine-sliced to any size.

/** Nine-slice a painted plate to w×h, drawing its corners at `s` of their painted size. */
function sliced(scene: Phaser.Scene, key: string, w: number, h: number, inset: number, s: number): Phaser.GameObjects.NineSlice {
  // the slice needs room for both corners; very small boxes draw the corners smaller still
  const k = Math.min(s, w / (inset * 2 + 2), h / (inset * 2 + 2));
  return scene.add.nineslice(0, 0, key, undefined, w / k, h / k, inset, inset, inset, inset).setScale(k);
}

/** The navy steel panel (riveted corners) at any size, centred on x, y. */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Phaser.GameObjects.NineSlice {
  return sliced(scene, 'ui-kit/panel', w, h, 110, 0.6).setPosition(x, y);
}

/** A section heading: bold white text, then a thin divider running on to `w` px from x. */
export function heading(scene: Phaser.Scene, x: number, y: number, text: string, w = 0): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, text, { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 6 }).setOrigin(0, 0.5);
  if (w > t.width + 30) scene.add.rectangle(x + t.width + 16, y + 2, w - t.width - 16, 3, 0x8991b6, 0.75).setOrigin(0, 0.5);
  return t;
}

export interface ChipOpts {
  /** 'chip': the navy button plate (options, toggles); 'slot': the octagonal slot (pieces, cards). */
  plate?: 'chip' | 'slot';
  size?: number;
  onClick?: () => void;
}

/**
 * A selectable painted button of any size: a navy plate normally, the gold-rimmed box when
 * selected. Holds an optional label and anything added to it (local space, centre 0,0).
 */
export class Chip extends Phaser.GameObjects.Container {
  readonly text: Phaser.GameObjects.Text;
  private normal: Phaser.GameObjects.NineSlice;
  private picked: Phaser.GameObjects.NineSlice;
  private enabled = true;
  selected = false;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly w: number, readonly h: number, str: string, opts: ChipOpts = {}) {
    super(scene, x, y);
    this.normal = opts.plate === 'slot'
      ? sliced(scene, 'ui-kit/slot', w, h, 72, 0.5)
      : sliced(scene, 'ui-ranked/btn-wardrobe', w, h, 30, 0.75);
    this.picked = sliced(scene, 'ui-lobby/input-name', w, h, 40, 0.7).setVisible(false);
    this.text = scene.add.text(0, 0, str, {
      fontFamily: FONT, fontSize: `${opts.size ?? 28}px`, fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 5, align: 'center',
    }).setOrigin(0.5);
    fit(this.text, w - 24, h - 8);
    const zone = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: !!opts.onClick });
    this.add([this.normal, this.picked, this.text, zone]);
    scene.add.existing(this);
    if (!opts.onClick) return;
    let held = false;
    zone.on('pointerdown', () => {
      if (!this.enabled) return;
      held = true;
      this.setScale(0.96);
      sfx.click();
    });
    zone.on('pointerout', () => {
      held = false;
      this.setScale(1);
    });
    zone.on('pointerup', () => {
      if (!held) return;
      held = false;
      this.setScale(1);
      opts.onClick!();
    });
    zone.on('pointerover', () => {
      if (this.enabled) this.setScale(1.03);
    });
  }

  setSelected(on: boolean): this {
    this.selected = on;
    this.normal.setVisible(!on);
    this.picked.setVisible(on);
    this.text.setColor(on ? '#ffd166' : '#ffffff');
    return this;
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    return this.setAlpha(on ? 1 : 0.55);
  }

  /** Put the label at (x, y) in local space, keeping its origin. */
  placeText(x: number, y: number, maxW: number, maxH: number): this {
    this.text.setPosition(x, y);
    fit(this.text.setScale(1), maxW, maxH);
    return this;
  }
}

/**
 * The top of a themed screen: back button, the title plate (logo, icon, title) and the
 * wallet with settings. Returns a setter for the title.
 */
export function screenChrome(scene: Phaser.Scene, opts: { title: string; icon: string; onBack: () => void }): (title: string) => void {
  const box = (b: Box) => mockupBox(b, 1672);
  const back = new PlateButton(scene, 'ui-ranked/btn-back', box([24, 18, 94, 84]), opts.onBack);
  back.put(fitted(scene, 'ui-ranked/ico-back', back.w * 0.5, back.h * 0.5), 0.5, 0.5);
  filled(scene, 'ui-lobby/header', box([143, 27, 675, 95]));
  placed(scene, 'ui-lobby/logo', box([139, 17, 173, 92]));
  const [dx, dy, , dh] = box([328, 50, 3, 40]);
  scene.add.rectangle(dx, dy, 3, dh, 0x8991b6, 0.75).setOrigin(0);
  placed(scene, opts.icon, box([352, 41, 81, 58]));
  const [tx, ty, tw, th] = box([452, 35, 330, 68]);
  const title = scene.add.text(tx, ty + th / 2, '', {
    fontFamily: FONT, fontSize: '64px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 8,
  }).setOrigin(0, 0.5);
  walletBar(scene);
  const set = (t: string) => {
    title.setText(t);
    fit(title.setScale(1), tw, th);
  };
  set(opts.title);
  return set;
}

/**
 * A section tab that sits on a panel's top edge: a slanted navy plate with a coloured rim,
 * an optional icon, and bold text. x, y is its left-middle. Returns its width.
 */
export function tab(scene: Phaser.Scene, x: number, y: number, text: string, opts: { color?: number; icon?: string; size?: number } = {}): number {
  const color = opts.color ?? 0xff8a1f;
  const h = 48;
  const t = scene.add.text(0, y, text, { fontFamily: FONT, fontSize: `${opts.size ?? 28}px`, fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 5 }).setOrigin(0, 0.5);
  const iconW = opts.icon ? 40 : 0;
  const w = 26 + iconW + t.width + 30;
  const lean = 14;
  const g = scene.add.graphics({ x, y });
  const pts = [
    { x: lean, y: -h / 2 }, { x: w, y: -h / 2 }, { x: w - lean, y: h / 2 }, { x: 0, y: h / 2 },
  ] as unknown as Phaser.Math.Vector2[];
  g.fillStyle(0x000000, 0.45);
  g.fillPoints(pts.map((p) => ({ x: p.x + 3, y: p.y + 4 })) as unknown as Phaser.Math.Vector2[], true);
  g.fillStyle(0x1a2042, 1);
  g.fillPoints(pts, true);
  g.lineStyle(4, color, 1);
  g.strokePoints(pts, true);
  g.lineStyle(2, 0xffffff, 0.18);
  g.lineBetween(lean + 6, -h / 2 + 5, w - 8, -h / 2 + 5);
  if (opts.icon) {
    const img = scene.add.image(x + 22 + iconW / 2, y, opts.icon);
    img.setScale(Math.min(34 / img.width, 30 / img.height));
  }
  t.setX(x + 22 + iconW + 4).setDepth(g.depth + 1);
  scene.children.bringToTop(t);
  return w;
}

/** Bright corner brackets over a panel's chamfered corners (x, y, w, h: the panel's outer box). */
export function accents(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color = 0xff8a1f): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const cut = 44; // the kit panel's chamfer at its drawn size
  const arm = 70;
  const corner = (cx: number, cy: number, sx: number, sy: number) => {
    const pts = [
      { x: cx, y: cy + sy * (cut + arm) }, { x: cx, y: cy + sy * cut }, { x: cx + sx * cut, y: cy }, { x: cx + sx * (cut + arm), y: cy },
    ] as unknown as Phaser.Math.Vector2[];
    g.lineStyle(10, 0x091024, 1);
    g.strokePoints(pts, false);
    g.lineStyle(6, color, 1);
    g.strokePoints(pts, false);
  };
  const i = 5; // sit on the bevel, just inside the black outline
  corner(x + i, y + i, 1, 1);
  corner(x + w - i, y + i, -1, 1);
  corner(x + i, y + h - i, 1, -1);
  corner(x + w - i, y + h - i, -1, -1);
  return g;
}

/** Any painted plate nine-sliced to w×h at x, y (corners drawn at `s` of their painted size). */
export function plate(scene: Phaser.Scene, key: string, x: number, y: number, w: number, h: number, inset: number, s: number): Phaser.GameObjects.NineSlice {
  return sliced(scene, key, w, h, inset, s).setPosition(x, y);
}
