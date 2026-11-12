import Phaser from 'phaser';
import { isMuted, setMuted, sfx } from '../audio/sfx';
import { account } from '../net/account';
import { net } from '../net/NetClient';
import { THEME, drawPlate } from '../ui/theme';
import { Button, FONT, fit } from '../ui/widgets';
import { menuBackdrop } from './backdrop';

/** Where each piece sits in the designer's 1672x941 mockup (new_ui/…/manifest.json), as [x, y, w, h]. */
type Box = [number, number, number, number];
const MOCKUP_W = 1672;
const K = 1920 / MOCKUP_W;
const box = (b: Box): Box => b.map((v) => Math.round(v * K)) as Box;

const STROKE = '#091024';

/** The right column of play buttons on the 1920x1080 canvas, and the gap between its plates. */
const COLUMN = { x: 1136, y: 205, w: 700 };
const GAP = 34;

/**
 * Where the painted face of each plate is inside its image, as [left, top, right, bottom]
 * fractions (measured on public/art/ui/btn-*.webp): the friends plate has a glow and gold
 * rays around it that should hang outside the column, the rest only a few px of margin.
 */
const FACES: Record<string, Face> = {
  bot: [5 / 760, 5 / 205, 755 / 760, 200 / 205],
  friends: [9 / 820, 46 / 272, 790 / 820, 262 / 272],
  ranked: [5 / 790, 5 / 206, 785 / 790, 201 / 206],
  shop: [3 / 380, 3 / 153, 377 / 380, 151 / 153],
  pass: [3 / 430, 3 / 138, 427 / 430, 135 / 138],
};
type Face = [number, number, number, number];
const FULL: Face = [0, 0, 1, 1];

/**
 * The first screen, built to the painted mockup: logo, slogan and three painted heroes on
 * the left, the three ways to play plus shop and pass on the right, the player card, wallet
 * and settings along the top. Every piece is its own image (public/art/ui/, made by
 * tools/prepare_menu_ui.py) with live text drawn over it, so names and numbers stay real.
 */
export default class MenuScene extends Phaser.Scene {
  private settings?: () => void;

  constructor() {
    super('menu');
  }

  create(): void {
    if (net.inRoom) {
      // reloaded mid-room: go straight back (the lobby rejoins and resumes a running match)
      this.scene.start('lobby');
      return;
    }
    this.settings = undefined;
    menuBackdrop(this);
    this.heroes();
    this.logo();
    this.modes();
    this.topBar();
  }

  /** An image fitted inside a mockup box (keeping its shape), centred on it. */
  private placed(key: string, b: Box): Phaser.GameObjects.Image {
    const [x, y, w, h] = box(b);
    const img = this.add.image(x + w / 2, y + h / 2, key);
    return img.setScale(Math.min(w / img.width, h / img.height));
  }

  /** Logo pops in and floats; the slogan plate fades in under it; a shell arcs off to the right. */
  private logo(): void {
    const logo = this.placed('ui-logo', [185, 118, 590, 239]);
    const s = logo.scale;
    logo.setScale(0);
    this.tweens.add({ targets: logo, scale: s, duration: 600, ease: 'Back.easeOut' });
    this.tweens.add({ targets: logo, y: logo.y + 10, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 600 });

    const slogan = this.placed('ui-slogan', [207, 355, 556, 76]).setAlpha(0);
    this.tweens.add({ targets: slogan, alpha: 1, duration: 500, delay: 400 });

    const trail = this.placed('ui-trail', [728, 206, 235, 90]).setAlpha(0);
    this.tweens.add({ targets: trail, alpha: 1, duration: 400, delay: 900 });
    this.tweens.add({ targets: trail, x: trail.x + 8, y: trail.y + 6, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 1300 });
  }

  /** The three painted heroes on the rock: they drop in, then breathe. */
  private heroes(): void {
    const heroes: [string, Box][] = [
      ['ui-char-scout', [134, 492, 242, 325]],
      ['ui-char-bear', [593, 511, 236, 305]],
      ['ui-char-hero', [293, 432, 310, 392]], // in front
    ];
    heroes.forEach(([key, b], i) => {
      const [x, y, w, h] = box(b);
      const img = this.add.image(x + w / 2, y + h, key).setOrigin(0.5, 1);
      img.setScale(Math.min(w / img.width, h / img.height));
      const ground = img.y;
      const sy = img.scaleY;
      img.y = ground - 700;
      this.tweens.add({ targets: img, y: ground, duration: 500, delay: 250 + i * 140, ease: 'Bounce.easeOut' });
      this.tweens.add({ targets: img, scaleY: sy * 1.03, duration: 760 + i * 90, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 900 });
    });
  }

  /**
   * The right column: the three ways to play as big painted plates stacked full width, then
   * shop and pass side by side. Every plate is sized by its painted face (FACES), so all
   * edges line up on COLUMN and the gaps between plates are GAP both ways; the contents sit
   * at the same distances from the face edges on every plate.
   */
  private modes(): void {
    const wide: [string, string, string, () => void][] = [
      ['bot', 'เล่นกับบอท', 'ฝึกมือ เล่นได้แม้ไม่มีเน็ต', () => {
        this.registry.set('setupMode', null);
        this.scene.start('setup');
      }],
      ['friends', 'เล่นกับเพื่อน', 'สร้างห้อง แล้วส่งรหัส 6 หลักให้เพื่อน', () => this.scene.start('lobby')],
      ['ranked', 'แข่งขันอันดับ', 'จับคู่กับผู้เล่นฝีมือใกล้กัน', () => this.scene.start('ranked')],
    ];
    let y = COLUMN.y;
    wide.forEach(([id, title, sub, go], i) => {
      const key = `ui-btn-${id}`;
      const h = COLUMN.w / this.faceAspect(key);
      const c = new PlateButton(this, key, [COLUMN.x, y, COLUMN.w, h], go, FACES[id]);
      y += h + GAP;
      // the friends face is framed by a thick gold rim; nudge its contents in from it
      const rim = id === 'friends' ? 0.03 : 0;
      c.putAt(this.fitted('ui-ico-' + id, 130, c.h * (0.62 - rim * 2)), 30 + 65 + (rim ? 6 : 0), c.h * 0.5);
      const t = this.add.text(0, 0, title, {
        fontFamily: FONT, fontSize: '56px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 10,
      }).setOrigin(0, 0.5);
      c.putAt(fit(t, 400, c.h * 0.5), 200, c.h * (0.38 + rim * 0.5));
      const s = this.add.text(0, 0, sub, { fontFamily: FONT, fontSize: '27px', color: '#e6f7ff' }).setOrigin(0, 0.5);
      c.putAt(fit(s, 420, c.h * 0.28), 202, c.h * (0.7 - rim * 0.5));
      const arrow = this.fitted('ui-arrow', 34, 54);
      c.putAt(arrow, c.w - 30 - 26 - (rim ? 6 : 0), c.h * 0.5);
      this.tweens.add({ targets: arrow, x: arrow.x + 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 200 });
      const home = c.x;
      c.x += 800;
      this.tweens.add({
        targets: c, x: home, duration: 450, delay: 150 + i * 110, ease: 'Cubic.easeOut',
        onComplete: () => c.glint(1400 + i * 260),
      });
    });

    // shop and pass: one height, widths in proportion to their faces, GAP between them
    const small: [string, string, () => void][] = [
      ['shop', 'ร้านค้า', () => this.scene.start('shop')],
      ['pass', 'Battle Pass', () => this.scene.start('pass')],
    ];
    const aspects = small.map(([id]) => this.faceAspect(`ui-btn-${id}`));
    const h = (COLUMN.w - GAP) / (aspects[0] + aspects[1]);
    let x = COLUMN.x;
    small.forEach(([id, name, go], i) => {
      const w = h * aspects[i];
      const c = new PlateButton(this, `ui-btn-${id}`, [x, y, w, h], go, FACES[id]);
      x += w + GAP;
      const icon = this.fitted('ui-ico-' + id, 84, h * 0.66);
      c.putAt(icon, 26 + 42, h * 0.5);
      const t = this.add.text(0, 0, name, {
        fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 8,
      }).setOrigin(0.5, 0.5);
      // centred in the space right of the icon
      const left = 26 + 84 + 10;
      c.putAt(fit(t, w - left - 22, h * 0.6), (left + w - 22) / 2, h * 0.48);
      c.setAlpha(0);
      this.tweens.add({ targets: c, alpha: 1, duration: 400, delay: 550 + i * 80 });
    });
  }

  /** Width over height of a plate's painted face. */
  private faceAspect(key: string): number {
    const f = FACES[key.replace('ui-btn-', '')];
    const src = this.textures.get(key).getSourceImage();
    return (src.width * (f[2] - f[0])) / (src.height * (f[3] - f[1]));
  }

  /** An image scaled to fit w×h. */
  private fitted(key: string, w: number, h: number): Phaser.GameObjects.Image {
    const img = this.add.image(0, 0, key);
    return img.setScale(Math.min(w / img.width, h / img.height));
  }

  /** Player card (tap to manage the account), coins, gems and the settings gear. */
  private topBar(): void {
    const card = new PlateButton(this, 'ui-status', box([29, 5, 490, 120]), () => this.scene.start('account'));
    const dot = this.add.circle(0, 0, card.h * 0.075, 0xff4040).setStrokeStyle(4, 0xffffff);
    card.put(dot, 0.32, 0.38);
    const name = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 6 }).setOrigin(0, 0.5);
    card.put(name, 0.36, 0.38);
    const sub = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '21px', color: '#e6f0ff' }).setOrigin(0, 0.5);
    card.put(sub, 0.29, 0.62);

    const coins = this.counter('coins', box([1068, 24, 242, 65]));
    const gems = this.counter('gems', box([1323, 25, 235, 65]));

    const gear = new PlateButton(this, 'ui-btn-settings', box([1572, 19, 84, 77]), () => this.toggleSettings(gear));
    gear.put(this.fitted('ui-ico-settings', gear.w * 0.6, gear.h * 0.6), 0.5, 0.5);

    const show = () => {
      const a = account.view;
      dot.setFillStyle(a ? 0x3ddc6a : 0xff4040);
      name.setText(a ? a.displayName : 'ออฟไลน์');
      fit(name, card.w * 0.56, card.h * 0.34);
      sub.setText(!a ? 'ต่อเซิร์ฟเวอร์ไม่ได้ เล่นกับบอทได้' : a.username ? `🏆 ${a.rating}  ·  เล่น ${a.played} เกม` : `🏆 ${a.rating}  ·  บัญชีชั่วคราว แตะเพื่อตั้งชื่อ`);
      fit(sub.setScale(1), card.w * 0.62, card.h * 0.26);
      coins(a ? a.coins : null);
      gems(a ? a.gems : null);
    };
    show();
    const stop = account.onChange(show);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
    void account.ensure();
  }

  /** A painted wallet bar with its icon and a + that opens the shop; returns the setter for its number. */
  private counter(kind: 'coins' | 'gems', b: Box): (n: number | null) => void {
    const [x, y, w, h] = b;
    const bar = this.add.image(x + w / 2, y + h / 2, `ui-cur-${kind}`);
    bar.setScale(Math.min(w / bar.width, h / bar.height));
    const bw = bar.displayWidth;
    const bh = bar.displayHeight;
    const at = (fx: number) => bar.x - bw / 2 + fx * bw;
    const icon = this.add.image(at(kind === 'coins' ? 0.155 : 0.16), bar.y, `ui-ico-${kind === 'coins' ? 'coin' : 'gem'}`);
    icon.setScale(Math.min((bw * 0.23) / icon.width, (bh * 0.85) / icon.height));
    const value = this.add.text(at(0.52), bar.y, '', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 4 }).setOrigin(0.5);
    const plus = new PlateButton(this, 'ui-plus', [at(0.78), bar.y - bh * 0.35, bw * 0.17, bh * 0.7], () => this.scene.start('shop'));
    plus.setDepth(1);
    return (n) => {
      value.setText(n === null ? '–' : n.toLocaleString('en-US'));
      fit(value.setScale(1), bw * 0.46, bh * 0.8);
    };
  }

  /** A small panel under the gear: sound on/off and the account screen. Tap the gear or outside to close. */
  private toggleSettings(gear: PlateButton): void {
    if (this.settings) {
      this.settings();
      return;
    }
    const x = gear.x - 150 + gear.w / 2;
    const y = gear.y + gear.h / 2 + 110;
    const shield = this.add.zone(960, 540, 1920, 1080).setInteractive().setDepth(20);
    const panel = this.add.graphics({ x, y }).setDepth(21);
    drawPlate(panel, 300, 190, THEME.steelDark, { cut: 14 });
    const soundLabel = () => (isMuted() ? 'เสียง: ปิด' : 'เสียง: เปิด');
    const sound: Button = new Button(this, x, y - 42, 260, 64, soundLabel(), {
      size: 26,
      onClick: () => {
        setMuted(!isMuted());
        sound.text.setText(soundLabel());
      },
    }).setDepth(22);
    const acct = new Button(this, x, y + 42, 260, 64, 'บัญชีผู้เล่น', { size: 26, onClick: () => this.scene.start('account') }).setDepth(22);
    const close = () => {
      for (const o of [shield, panel, sound, acct]) o.destroy();
      this.settings = undefined;
    };
    shield.on('pointerdown', close);
    this.settings = close;
  }
}

/**
 * A painted plate that is a button: the image scaled so its painted face (`face`, fractions
 * of the image) fills the box, a hit zone the size of that face, a lift on hover and a sink
 * when pressed. Children go in its local space (centre of the face at 0,0); `put` places them
 * by fractions of the face, `putAt` by px from its top-left.
 */
class PlateButton extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  private base: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, key: string, [x, y, bw, bh]: Box, onClick: () => void, face: Face = FULL) {
    super(scene, x + bw / 2, y + bh / 2);
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
      onClick();
    });
    zone.on('pointerover', () => this.setScale(1.03));
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
