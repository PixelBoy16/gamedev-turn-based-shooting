import Phaser from 'phaser';
import { sfx } from '../audio/sfx';

export const FONT = 'system-ui, "Noto Sans Thai", sans-serif';
export const INK = 0x1b2030;
export const TEAM_COLORS = [0x3b82f6, 0xef4444];

export function label(scene: Phaser.Scene, x: number, y: number, str: string, size: number, color = '#ffffff'): Phaser.GameObjects.Text {
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#1b2030', strokeThickness: Math.max(3, size / 6) });
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
      stroke: '#1b2030', strokeThickness: 4,
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
    const fill = this.opts.fill ?? 0x2b3350;
    g.fillStyle(INK, 0.9);
    if (this.opts.circle) {
      g.fillCircle(0, 0, w / 2 + 4);
      g.fillStyle(fill, 0.9);
      g.fillCircle(0, 0, w / 2);
      if (this.selected) {
        g.lineStyle(6, 0xffd166, 1);
        g.strokeCircle(0, 0, w / 2);
      }
      return;
    }
    const r = this.opts.radius ?? 14;
    g.fillRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, r + 3);
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.12);
    g.fillRoundedRect(-w / 2 + 6, -h / 2 + 5, w - 12, h * 0.35, r * 0.6);
    if (this.selected) {
      g.lineStyle(6, 0xffd166, 1);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    }
  }
}
