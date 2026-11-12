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

  /** The three ways to play as big painted plates, then shop and pass under them. */
  private modes(): void {
    const wide: [string, string, string, Box, () => void][] = [
      ['bot', 'เล่นกับบอท', 'ฝึกมือ เล่นได้แม้ไม่มีเน็ต', [982, 178, 640, 165], () => {
        this.registry.set('setupMode', null);
        this.scene.start('setup');
      }],
      ['friends', 'เล่นกับเพื่อน', 'สร้างห้อง แล้วส่งรหัส 6 หลักให้เพื่อน', [963, 328, 690, 211], () => this.scene.start('lobby')],
      ['ranked', 'แข่งขันอันดับ', 'จับคู่กับผู้เล่นฝีมือใกล้กัน', [965, 543, 666, 175], () => this.scene.start('ranked')],
    ];
    wide.forEach(([id, title, sub, b, go], i) => {
      const c = new PlateButton(this, `ui-btn-${id}`, box(b), go);
      // the friends plate carries a glow rim, so its face sits a little lower and narrower
      const glow = id === 'friends';
      const fy = glow ? 0.04 : 0;
      c.put(this.fitted('ui-ico-' + id, c.w * (glow ? 0.17 : 0.2), c.h * (glow ? 0.5 : 0.66)), glow ? 0.17 : 0.165, 0.5 + fy);
      const t = this.add.text(0, 0, title, {
        fontFamily: FONT, fontSize: `${Math.round(c.w * 0.082)}px`, fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 10,
      }).setOrigin(0, 0.5);
      c.put(fit(t, c.w * 0.58, c.h * 0.52), 0.3, 0.37 + fy);
      const s = this.add.text(0, 0, sub, { fontFamily: FONT, fontSize: `${Math.round(c.w * 0.04)}px`, color: '#e6f7ff' }).setOrigin(0, 0.5);
      c.put(fit(s, c.w * 0.6, c.h * 0.3), 0.302, 0.7 + fy * 0.5);
      const arrow = this.fitted('ui-arrow', c.w * 0.05, c.h * (glow ? 0.28 : 0.34));
      c.put(arrow, glow ? 0.905 : 0.925, 0.5 + fy * 0.5);
      this.tweens.add({ targets: arrow, x: arrow.x + 8, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 200 });
      const home = c.x;
      c.x += 800;
      this.tweens.add({
        targets: c, x: home, duration: 450, delay: 150 + i * 110, ease: 'Cubic.easeOut',
        onComplete: () => c.glint(1400 + i * 260),
      });
    });

    const small: [string, string, Box, () => void][] = [
      ['shop', 'ร้านค้า', [953, 732, 314, 135], () => this.scene.start('shop')],
      ['pass', 'Battle Pass', [1274, 733, 361, 134], () => this.scene.start('pass')],
    ];
    small.forEach(([id, name, b, go], i) => {
      const c = new PlateButton(this, `ui-btn-${id}`, box(b), go);
      c.put(this.fitted('ui-ico-' + id, c.w * 0.27, c.h * 0.7), 0.245, 0.5);
      const t = this.add.text(0, 0, name, {
        fontFamily: FONT, fontSize: `${Math.round(c.w * (id === 'pass' ? 0.1 : 0.13))}px`, fontStyle: 'bold',
        color: '#ffffff', stroke: STROKE, strokeThickness: 8,
      }).setOrigin(0, 0.5);
      c.put(fit(t, c.w * 0.53, c.h * 0.6), 0.42, 0.48);
      c.setAlpha(0);
      this.tweens.add({ targets: c, alpha: 1, duration: 400, delay: 550 + i * 80 });
    });
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
 * A painted plate that is a button: the image fitted (keeping its shape) inside a box, a hit
 * zone the size of what shows, a lift on hover and a sink when pressed. Children go in its
 * local space (centre 0,0); `put` places them by fractions of the plate.
 */
class PlateButton extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  private base: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, key: string, [x, y, bw, bh]: Box, onClick: () => void) {
    super(scene, x + bw / 2, y + bh / 2);
    this.base = scene.add.image(0, 0, key);
    this.base.setScale(Math.min(bw / this.base.width, bh / this.base.height));
    this.w = this.base.displayWidth;
    this.h = this.base.displayHeight;
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

  /** Add `o` with its origin at (fx, fy) of the plate, 0..1 from the top-left. */
  put(o: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, fx: number, fy: number): this {
    o.setPosition(-this.w / 2 + fx * this.w, -this.h / 2 + fy * this.h);
    this.add(o);
    return this;
  }

  /** Every few seconds the plate flashes brighter, in its own silhouette (an additive copy of it fades up and out). */
  glint(delay: number): void {
    const flash = this.scene.add.image(0, 0, this.base.texture.key).setScale(this.base.scale).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.addAt(flash, 1);
    this.scene.tweens.add({ targets: flash, alpha: 0.28, duration: 260, yoyo: true, delay, repeatDelay: 4200, repeat: -1, ease: 'Sine.easeInOut' });
  }
}
