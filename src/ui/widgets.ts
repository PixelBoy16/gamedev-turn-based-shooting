import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { THEME, drawPlate, slantPoints } from './theme';

export const FONT = '"Kanit", system-ui, "Noto Sans Thai", sans-serif';
export const INK = THEME.panel;
export const TEAM_COLORS = [0x3b82f6, 0xef4444];

export function label(scene: Phaser.Scene, x: number, y: number, str: string, size: number, color = '#ffffff'): Phaser.GameObjects.Text {
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#0d0f15', strokeThickness: Math.max(3, size / 6) });
}

/** Shrink a text (about its origin) until it fits w×h; never enlarges. Thai in Kanit runs tall, so card text needs this. */
export function fit<T extends Phaser.GameObjects.Text>(t: T, w: number, h: number): T {
  return t.setScale(Math.min(1, w / t.width, h / t.height));
}

export interface ButtonOpts {
  fill?: number;
  size?: number; // font px
  radius?: number;
  circle?: boolean;
  onClick?: () => void;
  onDown?: (p: Phaser.Input.Pointer) => void;
  onUp?: (p: Phaser.Input.Pointer) => void;
}

/**
 * Rounded button with selected/disabled states. Hit area is the full rect, so
 * touch targets stay large (GDD: at least 56 px).
 */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  readonly text: Phaser.GameObjects.Text;
  private icon: Phaser.GameObjects.Image;
  private zone: Phaser.GameObjects.Zone;
  private selected = false;
  private enabled = true;
  private held = false;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly w: number, readonly h: number, str: string, private opts: ButtonOpts = {}) {
    super(scene, x, y);
    this.bg = scene.add.graphics();
    this.text = scene.add.text(0, 0, str, {
      fontFamily: FONT, fontSize: `${opts.size ?? 28}px`, color: '#ffffff', align: 'center',
      stroke: '#0d0f15', strokeThickness: 5,
    }).setOrigin(0.5);
    this.icon = scene.add.image(-w / 2 + h / 2, 0, '__DEFAULT').setVisible(false);
    this.zone = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    this.add([this.bg, this.icon, this.text, this.zone]);
    scene.add.existing(this);

    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.enabled) return;
      this.held = true;
      this.setScale(0.94);
      sfx.click();
      opts.onDown?.(p);
    });
    const release = (p: Phaser.Input.Pointer, click: boolean) => {
      if (!this.held) return;
      this.held = false;
      this.setScale(1);
      opts.onUp?.(p);
      if (click && this.enabled) opts.onClick?.();
    };
    this.zone.on('pointerup', (p: Phaser.Input.Pointer) => release(p, true));
    this.zone.on('pointerout', (p: Phaser.Input.Pointer) => release(p, false));
    this.redraw();
  }

  setSelected(v: boolean): this {
    if (v !== this.selected) {
      this.selected = v;
      this.redraw();
    }
    return this;
  }

  setEnabled(v: boolean): this {
    if (v !== this.enabled) {
      this.enabled = v;
      this.setAlpha(v ? 1 : 0.45);
      this.redraw();
    }
    return this;
  }

  /** Square icon on the left of the button (null removes it); the label shifts right to make room. */
  setIcon(key: string | null, size = this.h - 14): this {
    if (!key) {
      this.icon.setVisible(false);
      this.text.setX(0);
      return this;
    }
    if (this.icon.texture.key !== key || !this.icon.visible) {
      this.icon.setTexture(key).setVisible(true);
      const s = size / Math.max(this.icon.width, this.icon.height);
      this.icon.setScale(s).setX(-this.w / 2 + 8 + size / 2);
      this.text.setX(size / 2 + 2);
    }
    return this;
  }

  setLabel(str: string): this {
    if (this.text.text !== str) this.text.setText(str);
    return this;
  }

  private redraw(): void {
    const { w, h } = this;
    const g = this.bg;
    g.clear();
    const fill = this.opts.fill ?? THEME.steel;
    if (this.opts.circle) {
      g.fillStyle(THEME.ink, 0.95);
      g.fillCircle(0, 0, w / 2 + 4);
      g.fillStyle(fill, 0.95);
      g.fillCircle(0, 0, w / 2);
      if (this.selected) {
        g.lineStyle(6, THEME.fire, 1);
        g.strokeCircle(0, 0, w / 2);
      }
      return;
    }
    drawPlate(g, w, h, fill, { cut: this.opts.radius, selected: this.selected });
  }
}

/** A yes/no window over everything; tapping outside or "ยกเลิก" closes it. Returns a close function. */
export function confirmBox(scene: Phaser.Scene, text: string, yes: string, onYes: () => void): () => void {
  const parts: Phaser.GameObjects.GameObject[] = [];
  const close = () => {
    for (const p of parts) p.destroy();
    parts.length = 0;
  };
  parts.push(scene.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.5).setInteractive().setDepth(60).on('pointerdown', close));
  const g = scene.add.graphics().setDepth(61).setPosition(960, 540);
  drawPlate(g, 800, 320, THEME.panel, { cut: 28, rivets: true, selected: true });
  parts.push(g);
  parts.push(scene.add.text(960, 470, text, { fontFamily: FONT, fontSize: '34px', color: '#ffffff', align: 'center', wordWrap: { width: 720 } })
    .setOrigin(0.5).setDepth(62));
  parts.push(new Button(scene, 820, 620, 260, 90, yes, { fill: THEME.green, size: 34, onClick: () => { close(); onYes(); } }).setDepth(62));
  parts.push(new Button(scene, 1100, 620, 260, 90, 'ยกเลิก', { size: 32, onClick: close }).setDepth(62));
  return close;
}

/** A small slanted fire-orange tab that heads a section; `x` is its left edge, `y` its middle. */
export function sectionTab(scene: Phaser.Scene, x: number, y: number, str: string, fill: number = THEME.fire): Phaser.GameObjects.Container {
  const t = label(scene, 0, 0, str, 22).setOrigin(0.5);
  const w = t.width + 40;
  const g = scene.add.graphics();
  g.fillStyle(THEME.ink, 0.9);
  g.fillPoints(slantPoints(w + 8, 40, 8, 4) as unknown as Phaser.Math.Vector2[], true);
  g.fillStyle(fill, 1);
  g.fillPoints(slantPoints(w, 34, 8) as unknown as Phaser.Math.Vector2[], true);
  return scene.add.container(x + w / 2, y, [g, t]);
}

/** "🪙 500   💎 50" */
export const walletText = (coins: number, gems: number) => `🪙 ${coins.toLocaleString()}   💎 ${gems.toLocaleString()}`;
