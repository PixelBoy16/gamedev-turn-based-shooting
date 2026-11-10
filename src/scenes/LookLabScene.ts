import Phaser from 'phaser';
import { ART_SCALE, gunLook, lookTexture } from '../art/chibi';
import {
  Align, LOOK_FRAME, LOOK_RES, Nudge, getAlign, hasLayer, layerRect, painted, paintedHand, setAlign, sourcePerLogical, toSource,
} from '../art/look';
import { BODY, allLookFiles, fileOwner } from '../art/lookNames';
import { DEFAULT_LOADOUT, Loadout, copyLoadout, fashionDef } from '../core/gear';
import { Button, FONT, INK, label } from '../ui/widgets';

// Dev tool (open the game with ?lab): line up the painted layers from ChatGPT on the
// base body. Pick a file on the left, drag it or nudge it with the keys, then save:
// the offsets go to src/art/look/align.json and every look in the game uses them.

const SEL_KEY = 'crater-clash:lab';
const CX = 1000;
const FEET = 990;
const ZOOM = 5.5;

export default class LookLabScene extends Phaser.Scene {
  private loadout!: Loadout;
  private selected = BODY;
  private saved = '';
  private avatar!: Phaser.GameObjects.Image;
  private gun!: Phaser.GameObjects.Image;
  private overlay!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private rows = new Map<string, Phaser.GameObjects.Text>();
  private handMode = false;
  private gunHidden = false;
  private gunBtn!: Button;

  constructor() {
    super('looklab');
  }

  create(): void {
    this.loadout = copyLoadout(DEFAULT_LOADOUT);
    this.saved = JSON.stringify(getAlign());
    this.add.rectangle(960, 540, 1920, 1080, INK);

    const files = allLookFiles();
    const have = files.filter(hasLayer).length;
    label(this, 40, 24, `ภาพที่มี ${have}/${files.length}`, 26, '#ffd166');
    files.forEach((name, i) => {
      const row = this.add.text(40 + Math.floor(i / 16) * 250, 80 + (i % 16) * 58, '', { fontFamily: FONT, fontSize: '22px' })
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.select(name));
      this.rows.set(name, row);
    });

    // the frame the game shows, with the feet and head-top guides
    const f = LOOK_FRAME;
    const board = this.add.graphics();
    board.fillStyle(0x2a3350, 1);
    board.fillRect(CX - (f.w * ZOOM) / 2, FEET - f.h * ZOOM, f.w * ZOOM, f.h * ZOOM);
    board.lineStyle(2, 0x5d6a8f, 1);
    board.lineBetween(CX, FEET - f.h * ZOOM, CX, FEET);
    board.lineBetween(CX - (f.w * ZOOM) / 2, FEET, CX + (f.w * ZOOM) / 2, FEET);
    board.lineBetween(CX - (f.w * ZOOM) / 2, FEET - 131 * ZOOM, CX + (f.w * ZOOM) / 2, FEET - 131 * ZOOM);

    this.avatar = this.add.image(CX, FEET, '__DEFAULT').setOrigin(0.5, 1);
    this.gun = this.add.image(0, 0, '__DEFAULT');
    this.overlay = this.add.graphics();
    this.info = this.add.text(1480, 80, '', { fontFamily: FONT, fontSize: '24px', color: '#e6ecff', lineSpacing: 10, wordWrap: { width: 420 } }).setDepth(5);

    // drag the selected layer; in hand mode a click puts the fist there
    const hit = this.add.zone(CX, FEET - (f.h * ZOOM) / 2, f.w * ZOOM, f.h * ZOOM).setInteractive();
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.handMode) return;
      const s = toSource((p.x - CX) / ZOOM + f.w / 2, (p.y - FEET) / ZOOM + f.h - 1);
      this.change({ ...getAlign(), hand: { x: Math.round(s.x), y: Math.round(s.y) } });
      this.handMode = false;
    });
    hit.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.handMode || !hasLayer(this.selected)) return;
      const k = sourcePerLogical() / ZOOM;
      this.nudge({ dx: (p.x - p.prevPosition.x) * k, dy: (p.y - p.prevPosition.y) * k });
    });

    const kb = this.input.keyboard!;
    kb.on('keydown', (e: KeyboardEvent) => this.key(e));
    this.gunBtn = new Button(this, 1700, 890, 370, 64, 'ซ่อนปืน (G)', { size: 24, onClick: () => this.toggleGun() });
    new Button(this, 1590, 980, 200, 72, 'บันทึก (S)', { fill: 0x2f9e44, size: 26, onClick: () => this.save() });
    new Button(this, 1800, 980, 160, 72, 'ออก', { size: 26, onClick: () => this.scene.start('menu') });

    let start = BODY;
    try {
      start = sessionStorage.getItem(SEL_KEY) ?? BODY;
    } catch {
      // ignore
    }
    this.select(files.includes(start) ? start : BODY);
  }

  private key(e: KeyboardEvent): void {
    const big = e.shiftKey ? 10 : 1;
    const step: Record<string, Partial<Nudge>> = {
      ArrowLeft: { dx: -big }, ArrowRight: { dx: big }, ArrowUp: { dy: -big }, ArrowDown: { dy: big },
      z: { s: -0.01 * big }, x: { s: 0.01 * big }, Z: { s: -0.05 }, X: { s: 0.05 },
    };
    if (step[e.key]) {
      e.preventDefault();
      this.nudge(step[e.key]);
    } else if (e.key === 'r' || e.key === 'R') {
      const layers = { ...getAlign().layers };
      delete layers[this.selected];
      this.change({ ...getAlign(), layers });
    } else if (e.key === 'h' || e.key === 'H') {
      this.handMode = !this.handMode;
      this.refresh();
    } else if (e.key === 'g' || e.key === 'G') {
      this.toggleGun();
    } else if (e.key === ' ') {
      e.preventDefault();
      this.blink();
    } else if (e.key === 's' || e.key === 'S') this.save();
  }

  private select(name: string): void {
    this.selected = name;
    const owner = fileOwner(name);
    if (owner) {
      if (owner.slot !== 'set') this.loadout.look.set = 'none';
      if (owner.slot === 'hat' || owner.slot === 'glasses') this.loadout.hide[owner.slot] = false;
      this.loadout.look[owner.slot] = owner.id;
    }
    this.refresh();
  }

  private nudge(d: Partial<Nudge>): void {
    const a = getAlign();
    const cur = a.layers[this.selected] ?? { dx: 0, dy: 0, s: 1 };
    const next: Nudge = {
      dx: Math.round((cur.dx + (d.dx ?? 0)) * 10) / 10,
      dy: Math.round((cur.dy + (d.dy ?? 0)) * 10) / 10,
      s: Math.max(0.2, Math.round((cur.s + (d.s ?? 0)) * 1000) / 1000),
    };
    this.change({ ...a, layers: { ...a.layers, [this.selected]: next } });
  }

  private change(next: Align): void {
    setAlign(this, next);
    this.refresh();
  }

  /** Show or hide the weapon, to see the pieces it covers. The fist marker stays. */
  private toggleGun(): void {
    this.gunHidden = !this.gunHidden;
    this.gunBtn.setSelected(this.gunHidden);
    this.refresh();
  }

  /** Hide the selected piece for a moment, to compare with and without it (slots that can be empty). */
  private blink(): void {
    const owner = fileOwner(this.selected);
    if (!owner || !fashionDef(owner.slot, 'none')) return;
    this.loadout.look[owner.slot] = 'none';
    this.refresh();
    this.time.delayedCall(350, () => {
      this.loadout.look[owner.slot] = owner.id;
      this.refresh();
    });
  }

  private refresh(): void {
    for (const [name, row] of this.rows) {
      const ok = hasLayer(name);
      const on = name === this.selected;
      row.setText(`${ok ? '✓' : '·'} ${name}`).setColor(on ? '#ffd166' : ok ? '#9be564' : '#5d6a8f');
    }

    const res = painted() ? 1 / LOOK_RES : 1;
    this.avatar.setTexture(lookTexture(this, this.loadout)).setScale(ZOOM * res);

    const g = this.overlay;
    g.clear();
    const f = LOOK_FRAME;
    const left = CX - (f.w * ZOOM) / 2;
    const top = FEET - f.h * ZOOM;
    const r = layerRect(this.selected);
    if (r) {
      g.lineStyle(3, 0xffd166, 0.9);
      g.strokeRect(left + r.x * ZOOM, top + r.y * ZOOM, r.w * ZOOM, r.h * ZOOM);
    }

    const look = gunLook(this, this.loadout.weapon);
    this.gun.setVisible(painted() && !this.gunHidden);
    if (painted()) {
      const h = paintedHand();
      const hx = CX + h.x * ZOOM;
      const hy = FEET + h.y * ZOOM;
      this.gun.setTexture(look.key).setOrigin(look.ox, look.oy).setScale((look.scale * ZOOM) / ART_SCALE).setRotation(-0.5).setPosition(hx, hy);
      g.lineStyle(3, 0xff5d8f, 1);
      g.lineBetween(hx - 14, hy, hx + 14, hy);
      g.lineBetween(hx, hy - 14, hx, hy + 14);
    }

    const a = getAlign();
    const n = a.layers[this.selected] ?? { dx: 0, dy: 0, s: 1 };
    const dirty = JSON.stringify(a) !== this.saved;
    this.info.setText([
      this.selected,
      hasLayer(this.selected) ? `เลื่อน ${n.dx}, ${n.dy}   ขนาด ×${n.s}` : `ยังไม่มีไฟล์ src/art/look/${this.selected}.png`,
      painted() ? '' : 'ยังไม่มี body.png: แสดงตัวที่วาดด้วยโค้ดแทน',
      '',
      'ลาก หรือ ลูกศร = เลื่อน (Shift ×10)',
      'Z / X = ย่อ / ขยาย (Shift ×5)',
      'Space = ซ่อนชิ้นนี้แป๊บหนึ่ง เทียบก่อน-หลัง',
      'R = คืนค่าเดิมของชิ้นนี้',
      `H แล้วคลิก = ตั้งจุดกำปั้นถืออาวุธ${this.handMode ? '  ← คลิกที่ตัวได้เลย' : ''}`,
      'body = เลื่อน/ย่อทั้งตัวในกรอบ',
      '',
      dirty ? 'ยังไม่ได้บันทึก' : 'บันทึกแล้ว',
    ].join('\n'));
  }

  private async save(): Promise<void> {
    try {
      sessionStorage.setItem(SEL_KEY, this.selected);
    } catch {
      // ignore
    }
    const body = JSON.stringify(getAlign());
    const res = await fetch('/__look-align', { method: 'POST', body }).catch(() => null);
    if (res?.ok) this.saved = body;
    else this.info.setText('บันทึกไม่ได้: ต้องเปิดผ่าน npm run dev');
    if (res?.ok) this.refresh();
  }
}
