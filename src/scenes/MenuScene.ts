import Phaser from 'phaser';
import { account } from '../net/account';
import { net } from '../net/NetClient';
import { Box, Face, PlateButton, STROKE, fitted, mockupBox, placed, walletBar } from '../ui/plates';
import { FONT, fit } from '../ui/widgets';
import { menuBackdrop } from './backdrop';

/** Where each piece sits in the designer's 1672x941 mockup (new_ui/…/manifest.json), as [x, y, w, h]. */
const box = (b: Box): Box => mockupBox(b, 1672);

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

/**
 * The first screen, built to the painted mockup: logo, slogan and three painted heroes on
 * the left, the three ways to play plus shop and pass on the right, the player card, wallet
 * and settings along the top. Every piece is its own image (public/art/ui/, made by
 * tools/prepare_menu_ui.py) with live text drawn over it, so names and numbers stay real.
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
    this.heroes();
    this.logo();
    this.modes();
    this.topBar();
  }

  /** Logo pops in and floats; the slogan plate fades in under it; a shell arcs off to the right. */
  private logo(): void {
    const logo = placed(this, 'ui-logo', [185, 118, 590, 239]);
    const s = logo.scale;
    logo.setScale(0);
    this.tweens.add({ targets: logo, scale: s, duration: 600, ease: 'Back.easeOut' });
    this.tweens.add({ targets: logo, y: logo.y + 10, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 600 });

    const slogan = placed(this, 'ui-slogan', [207, 355, 556, 76]).setAlpha(0);
    this.tweens.add({ targets: slogan, alpha: 1, duration: 500, delay: 400 });

    const trail = placed(this, 'ui-trail', [728, 206, 235, 90]).setAlpha(0);
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
      c.putAt(fitted(this, 'ui-ico-' + id, 130, c.h * (0.62 - rim * 2)), 30 + 65 + (rim ? 6 : 0), c.h * 0.5);
      const t = this.add.text(0, 0, title, {
        fontFamily: FONT, fontSize: '56px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 10,
      }).setOrigin(0, 0.5);
      c.putAt(fit(t, 400, c.h * 0.5), 200, c.h * (0.38 + rim * 0.5));
      const s = this.add.text(0, 0, sub, { fontFamily: FONT, fontSize: '27px', color: '#e6f7ff' }).setOrigin(0, 0.5);
      c.putAt(fit(s, 420, c.h * 0.28), 202, c.h * (0.7 - rim * 0.5));
      const arrow = fitted(this, 'ui-arrow', 34, 54);
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
      const icon = fitted(this, 'ui-ico-' + id, 84, h * 0.66);
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

  /** Player card (tap to manage the account), then the wallet and settings gear. */
  private topBar(): void {
    const card = new PlateButton(this, 'ui-status', box([29, 5, 490, 120]), () => this.scene.start('account'));
    const dot = this.add.circle(0, 0, card.h * 0.075, 0xff4040).setStrokeStyle(4, 0xffffff);
    card.put(dot, 0.32, 0.38);
    const name = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 6 }).setOrigin(0, 0.5);
    card.put(name, 0.36, 0.38);
    const sub = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '21px', color: '#e6f0ff' }).setOrigin(0, 0.5);
    card.put(sub, 0.29, 0.62);

    walletBar(this);

    const show = () => {
      const a = account.view;
      dot.setFillStyle(a ? 0x3ddc6a : 0xff4040);
      name.setText(a ? a.displayName : 'ออฟไลน์');
      fit(name, card.w * 0.56, card.h * 0.34);
      sub.setText(!a ? 'ต่อเซิร์ฟเวอร์ไม่ได้ เล่นกับบอทได้' : a.username ? `🏆 ${a.rating}  ·  เล่น ${a.played} เกม` : `🏆 ${a.rating}  ·  บัญชีชั่วคราว แตะเพื่อตั้งชื่อ`);
      fit(sub.setScale(1), card.w * 0.62, card.h * 0.26);
    };
    show();
    const stop = account.onChange(show);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
    void account.ensure();
  }
}
