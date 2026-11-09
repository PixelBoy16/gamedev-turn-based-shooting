import Phaser from 'phaser';
import { ART_SCALE, lookRes, lookTexture } from '../art/chibi';
import { sfx } from '../audio/sfx';
import { DEFAULT_LOADOUT, Loadout } from '../core/gear';
import { account } from '../net/account';
import { net } from '../net/NetClient';
import { THEME, drawPlate, drawRibbon } from '../ui/theme';
import { FONT, label } from '../ui/widgets';
import { menuBackdrop } from './backdrop';

const GROUND = 1010; // where the showcase chibis stand
const HERO_X = 600; // centre of the logo and the chibis

/**
 * The first screen: logo and three dressed-up chibis on the left (one of them lobs a
 * shell now and then), the three ways to play on the right, the account and wallet on
 * top. Painted art (logo, icons) replaces the drawn stand-ins when the files exist.
 */
export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    if (net.inRoom) {
      // reloaded mid-room: go straight back (the lobby rejoins and resumes a running match)
      this.scene.start('lobby');
      return;
    }
    menuBackdrop(this);
    this.atmosphere();
    // a soft shade behind the right column so the cards read on any background
    const shade = this.add.graphics();
    shade.fillGradientStyle(0x07080c, 0x07080c, 0x07080c, 0x07080c, 0, 0.5, 0, 0.5);
    shade.fillRect(1060, 0, 860, 1080);

    this.logo();
    const shooter = this.chibis();
    this.modes();
    this.topBar();
    this.lobLoop(shooter);
  }

  /**
   * Mood over the backdrop: a dark ground band for the chibis to stand on, a fire glow at
   * their feet, darkened corners, and embers drifting up off the battlefield.
   */
  private atmosphere(): void {
    const ground = this.add.graphics();
    ground.fillGradientStyle(0x07080c, 0x07080c, 0x07080c, 0x07080c, 0, 0, 0.75, 0.75);
    ground.fillRect(0, 820, 1920, 260);
    const spot = this.add.graphics({ x: HERO_X, y: GROUND + 4 });
    spot.fillStyle(THEME.fire, 0.16);
    spot.fillEllipse(0, 0, 900, 110);
    spot.fillStyle(0xffb347, 0.14);
    spot.fillEllipse(0, 0, 560, 60);

    if (!this.textures.exists('menu-vignette')) {
      const tex = this.textures.createCanvas('menu-vignette', 480, 270)!;
      const g = tex.context.createRadialGradient(240, 135, 70, 240, 135, 280);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.6)');
      tex.context.fillStyle = g;
      tex.context.fillRect(0, 0, 480, 270);
      tex.refresh();
    }
    this.add.image(960, 540, 'menu-vignette').setDisplaySize(1920, 1080);

    if (!this.textures.exists('ember')) {
      const tex = this.textures.createCanvas('ember', 32, 32)!;
      const g = tex.context.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,230,160,1)');
      g.addColorStop(0.35, 'rgba(255,140,40,0.8)');
      g.addColorStop(1, 'rgba(255,90,20,0)');
      tex.context.fillStyle = g;
      tex.context.fillRect(0, 0, 32, 32);
      tex.refresh();
    }
    this.add.particles(0, 0, 'ember', {
      x: { min: 0, max: 1920 }, y: { min: 1000, max: 1100 },
      lifespan: { min: 4000, max: 7000 },
      speedY: { min: -150, max: -60 }, speedX: { min: -30, max: 30 },
      scale: { start: 0.55, end: 0 }, alpha: { start: 0.9, end: 0 },
      frequency: 140, blendMode: Phaser.BlendModes.ADD,
      advance: 5000, // already drifting when the menu opens
    });
  }

  private has(key: string): boolean {
    return this.textures.exists(key);
  }

  /** The painted logo, or the name in chunky gradient letters. Pops in, then floats. */
  private logo(): void {
    let logo: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
    if (this.has('art-logo')) {
      logo = this.add.image(HERO_X, 230, 'art-logo');
      logo.setScale(Math.min(960 / logo.width, 380 / logo.height));
    } else {
      // black letters with a hot orange rim and a burst of light behind them
      // one smooth radial gradient: stacked shapes showed their edges as rings on some screens
      if (!this.textures.exists('logo-glow')) {
        const tex = this.textures.createCanvas('logo-glow', 256, 256)!;
        const g = tex.context.createRadialGradient(128, 128, 0, 128, 128, 128);
        g.addColorStop(0, 'rgba(255,154,48,0.42)');
        g.addColorStop(0.5, 'rgba(255,122,26,0.16)');
        g.addColorStop(1, 'rgba(255,122,26,0)');
        tex.context.fillStyle = g;
        tex.context.fillRect(0, 0, 256, 256);
        tex.refresh();
      }
      const glow = this.add.image(HERO_X, 220, 'logo-glow').setDisplaySize(760, 320).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: glow, scaleX: glow.scaleX * 1.1, scaleY: glow.scaleY * 1.1, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const t = this.add.text(HERO_X, 220, 'BLACK BOOM', {
        fontFamily: FONT, fontSize: '150px', fontStyle: '900', color: '#1b1d26', stroke: '#ffb020', strokeThickness: 18,
        padding: { x: 20, y: 20 },
      }).setOrigin(0.5);
      const grad = t.context.createLinearGradient(0, 40, 0, t.height - 40);
      grad.addColorStop(0, '#5a6078');
      grad.addColorStop(0.55, '#1b1d26');
      grad.addColorStop(1, '#000000');
      t.setFill(grad);
      t.setShadow(0, 12, '#7a1d00', 0, true, false);
      logo = t;
    }
    const s = logo.scale;
    logo.setScale(0);
    this.tweens.add({ targets: logo, scale: s, duration: 600, ease: 'Back.easeOut' });
    this.tweens.add({ targets: logo, y: logo.y + 12, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 600 });
    const tagY = this.has('art-logo') ? 430 : 350;
    const band = this.add.graphics({ x: HERO_X, y: tagY });
    drawRibbon(band, 640, 62, THEME.steelDark, THEME.fire);
    const tag = label(this, HERO_X, tagY - 2, 'ยิงหนึ่งนัด เปลี่ยนแผนที่ทั้งแผ่น', 36).setOrigin(0.5);
    for (const o of [band, tag]) {
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 500, delay: 400 });
    }
  }

  /** The same chibi, dressed three ways; they drop in and breathe. Returns the one with the cannon. */
  private chibis(): Phaser.GameObjects.Image {
    const dress = (look: Partial<Loadout['look']>, weapon: Loadout['weapon']): Loadout =>
      ({ ...DEFAULT_LOADOUT, weapon, look: { ...DEFAULT_LOADOUT.look, ...look } });
    const looks: Loadout[] = [
      dress({ hair: 'ponytail', glasses: 'goggles', cloth: 'vest', eyes: 'squint', face: 'warpaint' }, 'splitter'),
      dress({ hat: 'aviator', hair: 'spiky', back: 'cape', face: 'scar' }, 'cannon'),
      dress({ set: 'bearskull', eyes: 'glow', back: 'ammo' }, 'hammer'),
    ];
    const imgs = looks.map((l, i) => {
      const x = HERO_X + (i - 1) * 280;
      const shadow = this.add.ellipse(x, GROUND, 170, 34, 0x1b2030, 0.25);
      const img = this.add.image(x, GROUND, lookTexture(this, l)).setOrigin(0.5, 1).setScale(ART_SCALE * (i === 1 ? 3.9 : 3.4) * lookRes());
      if (i === 0) img.setFlipX(true);
      const sy = img.scaleY;
      img.y = GROUND - 700;
      shadow.setScale(0.3);
      this.tweens.add({ targets: img, y: GROUND, duration: 500, delay: 250 + i * 140, ease: 'Bounce.easeOut' });
      this.tweens.add({ targets: shadow, scale: 1, duration: 500, delay: 250 + i * 140 });
      this.tweens.add({ targets: img, scaleY: sy * 1.04, duration: 700 + i * 90, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 900 });
      return img;
    });
    return imgs[1];
  }

  /** The three ways to play, as big cards with an icon, a name and one line about it. */
  private modes(): void {
    const cards: [string, string, string, number, () => void][] = [
      ['bot', 'เล่นกับบอท', 'ฝึกมือ เล่นได้แม้ไม่มีเน็ต', THEME.steel, () => {
        this.registry.set('setupMode', null);
        this.scene.start('setup');
      }],
      ['friends', 'เล่นกับเพื่อน', 'สร้างห้อง แล้วส่งรหัส 6 หลักให้เพื่อน', THEME.blue, () => this.scene.start('lobby')],
      ['ranked', 'แข่งจัดอันดับ', 'จับคู่กับผู้เล่นฝีมือใกล้กัน', THEME.red, () => this.scene.start('ranked')],
    ];
    cards.forEach(([icon, title, sub, fill, go], i) => {
      const c = new MenuCard(this, 1490, 400 + i * 190, 700, 160, fill, go);
      const badge = this.add.graphics({ x: -350 + 90, y: 0 });
      badge.fillStyle(THEME.ink, 0.55);
      badge.fillCircle(0, 0, 58);
      badge.lineStyle(4, 0xffffff, 0.18);
      badge.strokeCircle(0, 0, 58);
      c.add(badge);
      c.add(this.icon(-350 + 90, 0, icon, ['🤖', '👥', '🏆'][i], 112));
      c.add(this.add.text(-350 + 170, -24, title, { fontFamily: FONT, fontSize: '52px', fontStyle: 'bold', color: '#ffffff', stroke: '#1b2030', strokeThickness: 8 }).setOrigin(0, 0.5));
      c.add(this.add.text(-350 + 172, 36, sub, { fontFamily: FONT, fontSize: '24px', color: '#ffffff' }).setOrigin(0, 0.5).setAlpha(0.92));
      const chevron = this.add.text(316, 0, '›', { fontFamily: FONT, fontSize: '72px', color: '#ffffff', stroke: '#1b2030', strokeThickness: 8 }).setOrigin(0.5);
      c.add(chevron);
      this.tweens.add({ targets: chevron, x: 326, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 200 });
      c.x += 700;
      this.tweens.add({
        targets: c, x: 1490, duration: 450, delay: 150 + i * 110, ease: 'Cubic.easeOut',
        onComplete: () => this.shine(1490, 400 + i * 190, 700, 160, 1400 + i * 260),
      });
    });

    // shop and pass under the cards
    const small: [string, string, string, number, () => void][] = [
      ['shop', 'ร้านค้า', '🛍️', 0xa86a12, () => this.scene.start('shop')],
      ['pass', 'Battle Pass', '🎟️', THEME.purple, () => this.scene.start('pass')],
    ];
    small.forEach(([icon, name, emoji, fill, go], i) => {
      const c = new MenuCard(this, 1315 + i * 350, 960, 330, 110, fill, go);
      c.add(this.icon(-165 + 62, 0, icon, emoji, 82));
      c.add(this.add.text(-165 + 116, 0, name, { fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: '#ffffff', stroke: '#1b2030', strokeThickness: 6 }).setOrigin(0, 0.5));
      c.setAlpha(0);
      this.tweens.add({ targets: c, alpha: 1, duration: 400, delay: 550 + i * 80 });
    });
  }

  /**
   * A bright diagonal band that sweeps across a card every few seconds. Redrawn each frame
   * with its corners clamped inside the card, so it never spills past the edge. Started once
   * the card has slid into place.
   */
  private shine(x: number, y: number, w: number, h: number, delay: number): void {
    const band = this.add.graphics({ x, y }).setBlendMode(Phaser.BlendModes.ADD);
    const edge = w / 2 - 18; // inside the plate's cut corners
    const clamp = (v: number) => Phaser.Math.Clamp(v, -edge, edge);
    this.tweens.addCounter({
      from: -edge - 80, to: edge + 80, duration: 700, delay, repeatDelay: 4200, repeat: -1, ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        const c = tw.getValue() ?? 0;
        band.clear();
        band.fillStyle(0xffffff, 0.16);
        band.fillPoints([
          { x: clamp(c + 10), y: -h / 2 }, { x: clamp(c + 80), y: -h / 2 },
          { x: clamp(c - 10), y: h / 2 }, { x: clamp(c - 80), y: h / 2 },
        ] as unknown as Phaser.Math.Vector2[], true);
      },
      onRepeat: () => band.clear(),
    });
  }

  /** Painted icon `art-menu-<name>` fitted to `size`, or the emoji stand-in. */
  private icon(x: number, y: number, name: string, emoji: string, size: number): Phaser.GameObjects.GameObject {
    const key = `art-menu-${name}`;
    if (this.has(key)) {
      const img = this.add.image(x, y, key);
      return img.setScale(size / Math.max(img.width, img.height));
    }
    return this.add.text(x, y, emoji, { fontFamily: FONT, fontSize: `${Math.round(size * 0.62)}px` }).setOrigin(0.5);
  }

  /** Who you are (tap to manage the account) on the left; coins and gems on the right. */
  private topBar(): void {
    const card = new MenuCard(this, 40 + 240, 76, 480, 100, THEME.steelDark, () => this.scene.start('account'));
    const name = this.add.text(-210, -18, '', { fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0, 0.5);
    const sub = this.add.text(-210, 24, '', { fontFamily: FONT, fontSize: '22px', color: '#cfd8ff' }).setOrigin(0, 0.5);
    card.add([name, sub]);

    const coins = this.pill(1530, 'coin', '🪙');
    const gems = this.pill(1790, 'gem', '💎');
    const show = () => {
      const a = account.view;
      name.setText(a ? a.displayName : 'ออฟไลน์');
      sub.setText(!a ? 'ต่อเซิร์ฟเวอร์ไม่ได้ เล่นกับบอทได้' : a.username ? `🏆 ${a.rating}  ·  เล่น ${a.played} เกม` : `🏆 ${a.rating}  ·  บัญชีชั่วคราว แตะเพื่อตั้งชื่อ`);
      coins.setText(a ? a.coins.toLocaleString() : '–');
      gems.setText(a ? a.gems.toLocaleString() : '–');
    };
    show();
    const stop = account.onChange(show);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
    void account.ensure();
  }

  /** A rounded counter with an icon; returns its number text. */
  private pill(x: number, icon: string, emoji: string): Phaser.GameObjects.Text {
    const g = this.add.graphics({ x, y: 82 });
    drawPlate(g, 220, 60, THEME.steelDark, { cut: 12 });
    this.icon(x - 76, 82, icon, emoji, 70);
    return this.add.text(x + 86, 82, '', { fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(1, 0.5);
  }

  /** Every few seconds the middle chibi lobs a shell across the field; it lands in a puff of dirt. */
  private lobLoop(shooter: Phaser.GameObjects.Image): void {
    const fire = () => {
      const from = { x: shooter.x + 90, y: GROUND - shooter.displayHeight * 0.45 };
      const to = { x: Phaser.Math.Between(980, 1080), y: GROUND - 4 };
      const shell = this.add.circle(from.x, from.y, 13, 0x2b3350).setStrokeStyle(4, 0x1b2030);
      const trail = this.add.graphics();
      const pts: Phaser.Math.Vector2[] = [];
      const peak = Math.min(from.y, to.y) - Phaser.Math.Between(380, 480);
      this.tweens.addCounter({
        from: 0, to: 1, duration: 1100, ease: 'Linear',
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          // quadratic arc through the peak
          const x = Phaser.Math.Linear(from.x, to.x, t);
          const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * (2 * peak - (from.y + to.y) / 2) + t * t * to.y;
          shell.setPosition(x, y);
          pts.push(new Phaser.Math.Vector2(x, y));
          if (pts.length > 14) pts.shift();
          trail.clear();
          pts.forEach((p, i) => {
            trail.fillStyle(0xffffff, (i / pts.length) * 0.6);
            trail.fillCircle(p.x, p.y, 4 + i * 0.6);
          });
        },
        onComplete: () => {
          shell.destroy();
          trail.destroy();
          this.boom(to.x, to.y);
        },
      });
      this.tweens.add({ targets: shooter, angle: -6, duration: 90, yoyo: true });
    };
    this.time.addEvent({ delay: 4200, startAt: 2600, loop: true, callback: fire });
  }

  private boom(x: number, y: number): void {
    const flash = this.add.circle(x, y - 20, 30, 0xfff3b0, 0.95);
    this.tweens.add({ targets: flash, scale: 3, alpha: 0, duration: 260, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
    const ring = this.add.circle(x, y - 20, 40).setStrokeStyle(8, 0xffc93c);
    this.tweens.add({ targets: ring, scale: 2.6, alpha: 0, duration: 380, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    for (let i = 0; i < 14; i++) {
      const a = Phaser.Math.FloatBetween(Math.PI * 1.05, Math.PI * 1.95);
      const d = Phaser.Math.Between(60, 170);
      const bit = this.add.circle(x, y - 10, Phaser.Math.Between(6, 13), i % 3 ? 0x9c6b43 : 0x6fbf4b);
      this.tweens.add({
        targets: bit, x: x + Math.cos(a) * d, y: y - 10 + Math.sin(a) * d, alpha: 0, scale: 0.4,
        duration: Phaser.Math.Between(420, 650), ease: 'Quad.easeOut', onComplete: () => bit.destroy(),
      });
    }
    this.cameras.main.shake(140, 0.003);
  }
}

/**
 * A chunky tappable steel plate (see theme.ts), riveted when tall; sinks a little
 * when pressed. Children are added in its local space (centre 0,0).
 */
class MenuCard extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fill: number, onClick: () => void) {
    super(scene, x, y);
    const g = scene.add.graphics();
    drawPlate(g, w, h, fill, { rivets: h >= 140 });
    const zone = scene.add.zone(0, 0, w, h + 8).setInteractive({ useHandCursor: true });
    this.add([g, zone]);
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
    zone.on('pointerover', () => this.setScale(1.02));
  }
}
