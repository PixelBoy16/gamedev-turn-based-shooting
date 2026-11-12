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
