import Phaser from 'phaser';
import { ART_SCALE, gunLook, lookTexture } from '../art/chibi';
import {
  Align, LOOK_FRAME, LOOK_RES, Nudge, getAlign, handToSource, hasLayer, layerCorners, lookStack, nudgeOf, painted, paintedHand,
  paintedLook, setAlign, sourcePerLogical,
} from '../art/look';
import { BODY, BODY_PARTS, lookLayers, pieceFiles } from '../art/lookNames';
import { DEFAULT_LOADOUT, FASHION_SLOTS, FASHION_SLOT_NAME, FashionSlot, Loadout, copyLoadout, fashionDef, fashionIn } from '../core/gear';
import { Button, FONT, INK, label } from '../ui/widgets';

// Dev tool (open the game with ?lab): line up the painted layers from ChatGPT on the
// base body. Left: what the figure wears, then its layers front to back (click one to
// pick it, the dot hides it while you work). Middle: the figure; drag the picked layer.
// Right: move, scale, turn, flip and re-order it, then save: the values go to
// src/art/look/align.json and every look in the game uses them. "ทั้งตัว" is the whole figure.

const KEEP_KEY = 'crater-clash:lab';
const CX = 930;
const FEET = 1000;
const ZOOM = 5.4;
const PANEL_X = 1420;
const ROW_Y = 568;
const ROW_H = 34;

/** One property row on the right: how a step changes the nudge, and how to show it. */
interface Prop {
  name: string;
  step: (n: Nudge, sign: number, big: boolean) => Partial<Nudge>;
  show: (n: Nudge) => string;
}

const PROPS: Prop[] = [
  { name: 'ซ้าย-ขวา', step: (n, d, big) => ({ dx: n.dx + d * (big ? 10 : 1) }), show: (n) => `${n.dx}` },
  { name: 'ขึ้น-ลง', step: (n, d, big) => ({ dy: n.dy + d * (big ? 10 : 1) }), show: (n) => `${n.dy}` },
  { name: 'ขนาด', step: (n, d, big) => ({ s: n.s + d * (big ? 0.05 : 0.01) }), show: (n) => `×${n.s}` },
  { name: 'หมุน', step: (n, d, big) => ({ r: (n.r ?? 0) + d * (big ? 10 : 1) }), show: (n) => `${n.r ?? 0}°` },
];

export default class LookLabScene extends Phaser.Scene {
  private loadout!: Loadout;
  private selected = BODY;
  private saved = '';
  private hidden = new Set<string>();
  private gunHidden = false;
  private handMode = false;
  private avatar!: Phaser.GameObjects.Image;
  private gun!: Phaser.GameObjects.Image;
  private overlay!: Phaser.GameObjects.Graphics;
  private slotText = new Map<FashionSlot, Phaser.GameObjects.Text>();
  private layerList!: Phaser.GameObjects.Container;
  private title!: Phaser.GameObjects.Text;
  private propText: Phaser.GameObjects.Text[] = [];
  private flipBtn!: Button;
  private handBtn!: Button;
  private gunBtn!: Button;
  private status!: Phaser.GameObjects.Text;
  private shiftKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('looklab');
  }

  create(): void {
    this.loadout = copyLoadout(DEFAULT_LOADOUT);
    this.loadout.hide = { hat: false, glasses: false };
    this.restore();
    this.saved = JSON.stringify(getAlign());
    this.hidden.clear();
    this.add.rectangle(960, 540, 1920, 1080, INK);

    this.buildWardrobe();
    label(this, 40, ROW_Y - 52, 'เลเยอร์ (บนสุด = อยู่หน้าสุด)', 24, '#ffd166');
    this.layerList = this.add.container(0, 0);
    this.buildStage();
    this.buildPanel();

    const kb = this.input.keyboard!;
    this.shiftKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT, false);
    kb.on('keydown', (e: KeyboardEvent) => this.key(e));
    this.refresh();
  }

  // ---------------------------------------------------------------- left: outfit and layers

  private buildWardrobe(): void {
    label(this, 40, 24, 'ชุดที่ใส่', 24, '#ffd166');
    FASHION_SLOTS.forEach((slot, i) => {
      const y = 92 + i * 52;
      label(this, 40, y - 16, FASHION_SLOT_NAME[slot], 22, '#aab4d4');
      new Button(this, 185, y, 44, 44, '◀', { size: 20, onClick: () => this.cycle(slot, -1) });
      new Button(this, 445, y, 44, 44, '▶', { size: 20, onClick: () => this.cycle(slot, 1) });
      this.slotText.set(slot, this.add.text(315, y, '', { fontFamily: FONT, fontSize: '20px' }).setOrigin(0.5));
    });
  }

  private cycle(slot: FashionSlot, d: number): void {
    const list = fashionIn(slot);
    const i = list.findIndex((f) => f.id === this.loadout.look[slot]);
    this.loadout.look[slot] = list[(i + d + list.length) % list.length].id;
    if (slot !== 'set') this.loadout.look.set = 'none';
    const files = pieceFiles(slot, this.loadout.look[slot]).filter(hasLayer);
    if (files.length) this.selected = files[files.length - 1];
    this.refresh();
  }

  /** "ทั้งตัว", then the figure's layers front first; files that do not exist yet are listed greyed after them. */
  private drawLayerList(): void {
    this.layerList.removeAll(true);
    const stack = lookStack(this.loadout).filter((n) => n !== BODY).reverse();
    const parts = BODY_PARTS.some(hasLayer);
    const missing = lookLayers(this.loadout).filter((n) => !hasLayer(n) && n !== BODY && !(BODY_PARTS.includes(n) && !parts && hasLayer(BODY)));
    const rows = [BODY, ...stack];
    rows.forEach((name, i) => {
      const y = ROW_Y + i * ROW_H;
      const on = name === this.selected;
      if (name !== BODY) {
        const off = this.hidden.has(name);
        const dot = this.add.text(44, y, off ? '○' : '●', { fontFamily: FONT, fontSize: '22px', color: off ? '#5d6a8f' : '#9be564' })
          .setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.toggleHidden(name));
        this.layerList.add(dot);
      }
      const n = nudgeOf(name);
      const changed = n.dx || n.dy || n.s !== 1 || n.r || n.fx || n.z;
      const text = name === BODY ? 'ทั้งตัว (เลื่อน/ย่อทั้งหมด)' : `${name}${changed ? '  *' : ''}`;
      const row = this.add.text(78, y, text, { fontFamily: FONT, fontSize: '20px', color: on ? '#ffd166' : '#e6ecff', backgroundColor: on ? '#3a4566' : undefined })
        .setOrigin(0, 0.5).setPadding(6, 2, 6, 2).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.select(name));
      this.layerList.add(row);
    });
    if (missing.length) {
      const t = this.add.text(44, ROW_Y + rows.length * ROW_H, `ยังไม่มีไฟล์: ${missing.join(', ')}`, {
        fontFamily: FONT, fontSize: '17px', color: '#5d6a8f', wordWrap: { width: 420 },
      });
      this.layerList.add(t);
    }
  }

  private toggleHidden(name: string): void {
    if (this.hidden.has(name)) this.hidden.delete(name);
    else this.hidden.add(name);
    this.refresh();
  }

  private select(name: string): void {
    this.selected = name;
    this.handMode = false;
    this.refresh();
  }

  // ---------------------------------------------------------------- middle: the figure

  private buildStage(): void {
    const f = LOOK_FRAME;
    const left = CX - (f.w * ZOOM) / 2;
    const top = FEET - f.h * ZOOM;
    const board = this.add.graphics();
    board.fillStyle(0x2a3350, 1);
    board.fillRect(left, top, f.w * ZOOM, f.h * ZOOM);
    board.lineStyle(2, 0x5d6a8f, 1);
    board.lineBetween(CX, top, CX, FEET);
    board.lineBetween(left, FEET, left + f.w * ZOOM, FEET);
    board.lineBetween(left, FEET - 131 * ZOOM, left + f.w * ZOOM, FEET - 131 * ZOOM);
    label(this, left, 24, 'ลากในกรอบ = เลื่อนชิ้นที่เลือก    ลูกศร เลื่อน · Z/X ขนาด · Q/E หมุน', 20, '#aab4d4');
    label(this, left, 56, 'F กลับด้าน · [ ] ลำดับ · Shift = ทีละมาก · เส้นบน = ระดับหัว ล่าง = พื้น', 20, '#aab4d4');

    this.avatar = this.add.image(CX, FEET, '__DEFAULT').setOrigin(0.5, 1);
    this.gun = this.add.image(0, 0, '__DEFAULT');
    this.overlay = this.add.graphics();

    // drag the selected layer; in hand mode a click puts the fist there
    const hit = this.add.zone(CX, FEET - (f.h * ZOOM) / 2, f.w * ZOOM, f.h * ZOOM).setInteractive();
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.handMode) return;
      const s = handToSource((p.x - CX) / ZOOM + f.w / 2, (p.y - FEET) / ZOOM + f.h - 1);
      this.handMode = false;
      this.change({ ...getAlign(), hand: { x: Math.round(s.x), y: Math.round(s.y) } });
    });
    hit.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.handMode || !this.editable()) return;
      const k = sourcePerLogical() / ZOOM;
      const n = nudgeOf(this.selected);
      this.nudge({ dx: n.dx + (p.x - p.prevPosition.x) * k, dy: n.dy + (p.y - p.prevPosition.y) * k });
    });
  }

  private editable(): boolean {
    return this.selected === BODY ? painted() : hasLayer(this.selected);
  }

  // ---------------------------------------------------------------- right: the picked layer

  private buildPanel(): void {
    this.title = label(this, PANEL_X, 24, '', 30, '#ffd166');
    PROPS.forEach((prop, i) => {
      const y = 130 + i * 74;
      label(this, PANEL_X, y - 16, prop.name, 22, '#aab4d4');
      new Button(this, 1600, y, 64, 56, '−', { size: 30, onClick: () => this.step(prop, -1) });
      new Button(this, 1830, y, 64, 56, '+', { size: 30, onClick: () => this.step(prop, 1) });
      this.propText.push(this.add.text(1715, y, '', { fontFamily: FONT, fontSize: '26px' }).setOrigin(0.5));
    });
    this.flipBtn = new Button(this, 1530, 440, 220, 56, 'กลับด้าน (F)', { size: 22, onClick: () => this.flip() });
    new Button(this, 1770, 440, 220, 56, 'คืนค่าเดิม (R)', { size: 22, onClick: () => this.reset() });
    new Button(this, 1530, 510, 220, 56, 'ไปข้างหลัง [', { size: 22, onClick: () => this.order(-1) });
    new Button(this, 1770, 510, 220, 56, 'มาข้างหน้า ]', { size: 22, onClick: () => this.order(1) });
    label(this, PANEL_X, 552, 'กด Shift ค้างตอนคลิก − + = ทีละมาก', 18, '#5d6a8f');

    this.handBtn = new Button(this, 1530, 640, 220, 56, 'ตั้งจุดกำปั้น (H)', { size: 22, onClick: () => this.toggleHand() });
    this.gunBtn = new Button(this, 1770, 640, 220, 56, 'ซ่อนปืน (G)', { size: 22, onClick: () => this.toggleGun() });
    this.status = this.add.text(PANEL_X, 700, '', { fontFamily: FONT, fontSize: '22px', color: '#e6ecff', lineSpacing: 8, wordWrap: { width: 470 } });

    new Button(this, 1530, 990, 220, 72, 'บันทึก (S)', { fill: 0x2f9e44, size: 26, onClick: () => this.save() });
    new Button(this, 1770, 990, 220, 72, 'ออก', { size: 26, onClick: () => this.scene.start('menu') });
  }

  private step(prop: Prop, sign: number, big = this.shiftKey.isDown): void {
    if (!this.editable() || (this.selected === BODY && prop === PROPS[3])) return; // the whole figure does not turn
    this.nudge(prop.step(nudgeOf(this.selected), sign, big));
  }

  private flip(): void {
    if (!this.editable() || this.selected === BODY) return;
    this.nudge({ fx: !nudgeOf(this.selected).fx });
  }

  private order(d: number): void {
    if (!this.editable() || this.selected === BODY) return;
    this.nudge({ z: (nudgeOf(this.selected).z ?? 0) + d });
  }

  private reset(): void {
    const layers = { ...getAlign().layers };
    delete layers[this.selected];
    this.change({ ...getAlign(), layers });
  }

  private toggleHand(): void {
    this.handMode = !this.handMode;
    this.refresh();
  }

  private toggleGun(): void {
    this.gunHidden = !this.gunHidden;
    this.refresh();
  }

  private key(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    const props: Record<string, [number, number]> = {
      arrowleft: [0, -1], arrowright: [0, 1], arrowup: [1, -1], arrowdown: [1, 1], z: [2, -1], x: [2, 1], q: [3, -1], e: [3, 1],
    };
    if (props[k]) {
      e.preventDefault();
      this.step(PROPS[props[k][0]], props[k][1], e.shiftKey);
    } else if (k === 'f') this.flip();
    else if (k === '[' || k === '{') this.order(-1);
    else if (k === ']' || k === '}') this.order(1);
    else if (k === 'r') this.reset();
    else if (k === 'h') this.toggleHand();
    else if (k === 'g') this.toggleGun();
    else if (k === 's') this.save();
  }

  private nudge(d: Partial<Nudge>): void {
    const a = getAlign();
    const m = { ...nudgeOf(this.selected), ...d };
    const next: Nudge = {
      dx: Math.round(m.dx * 10) / 10,
      dy: Math.round(m.dy * 10) / 10,
      s: Math.max(0.2, Math.round(m.s * 1000) / 1000),
    };
    // the optional fields are only kept when they do something, so align.json stays short
    if (m.r) next.r = Math.round(m.r * 10) / 10;
    if (m.fx) next.fx = true;
    if (m.z) next.z = m.z;
    this.change({ ...a, layers: { ...a.layers, [this.selected]: next } });
  }

  private change(next: Align): void {
    setAlign(this, next);
    this.refresh();
  }

  // ---------------------------------------------------------------- drawing

  private refresh(): void {
    for (const slot of FASHION_SLOTS) {
      const id = this.loadout.look[slot];
      const files = pieceFiles(slot, id);
      const have = files.filter(hasLayer).length;
      const mark = !files.length ? '' : have === files.length ? ' ✓' : have ? ' ½' : ' ✗';
      const color = !files.length ? '#aab4d4' : have === files.length ? '#9be564' : '#ff8a8a';
      this.slotText.get(slot)!.setText(`${fashionDef(slot, id)?.name ?? id}${mark}`).setColor(color);
    }
    this.drawLayerList();

    if (painted()) this.avatar.setTexture(paintedLook(this, this.loadout, [...this.hidden])).setScale(ZOOM / LOOK_RES);
    else this.avatar.setTexture(lookTexture(this, this.loadout)).setScale(ZOOM);

    const g = this.overlay;
    g.clear();
    const f = LOOK_FRAME;
    const left = CX - (f.w * ZOOM) / 2;
    const top = FEET - f.h * ZOOM;
    const pts = this.selected === BODY ? null : layerCorners(this.selected);
    if (pts) {
      g.lineStyle(3, 0xffd166, 0.9);
      g.strokePoints(pts.map((p) => new Phaser.Math.Vector2(left + p.x * ZOOM, top + p.y * ZOOM)), true);
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

    const n = nudgeOf(this.selected);
    const can = this.editable();
    this.title.setText(this.selected === BODY ? 'ทั้งตัว' : this.selected);
    PROPS.forEach((p, i) => this.propText[i].setText(can && !(this.selected === BODY && i === 3) ? p.show(n) : '–'));
    this.flipBtn.setSelected(!!n.fx).setEnabled(can && this.selected !== BODY);
    this.handBtn.setSelected(this.handMode);
    this.gunBtn.setSelected(this.gunHidden);

    const dirty = JSON.stringify(getAlign()) !== this.saved;
    const z = n.z ?? 0;
    this.status.setText([
      !painted() ? 'ยังไม่มี body.png หรือชิ้นส่วนตัว: แสดงตัวที่วาดด้วยโค้ดแทน' : '',
      this.selected !== BODY && !can ? `ยังไม่มีไฟล์ src/art/look/${this.selected}.png` : '',
      this.selected !== BODY ? `ลำดับ ${z > 0 ? '+' : ''}${z}` : '',
      `ตัวแยกส่วน ${BODY_PARTS.filter(hasLayer).length}/${BODY_PARTS.length}`,
      this.handMode ? 'คลิกที่ตัวเพื่อวางจุดกำปั้น' : '',
      dirty ? '● ยังไม่ได้บันทึก' : 'บันทึกแล้ว',
    ].filter(Boolean).join('\n')).setColor(dirty ? '#ffd166' : '#9be564');
    this.keep();
  }

  /** Remember the outfit and the picked layer across reloads (the dev server reloads on save). */
  private keep(): void {
    try {
      sessionStorage.setItem(KEEP_KEY, JSON.stringify({ selected: this.selected, look: this.loadout.look }));
    } catch {
      // ignore
    }
  }

  private restore(): void {
    try {
      const raw = JSON.parse(sessionStorage.getItem(KEEP_KEY) ?? 'null');
      if (raw?.look) for (const slot of FASHION_SLOTS) if (fashionDef(slot, raw.look[slot])) this.loadout.look[slot] = raw.look[slot];
      if (typeof raw?.selected === 'string') this.selected = raw.selected;
    } catch {
      // ignore
    }
  }

  private async save(): Promise<void> {
    const body = JSON.stringify(getAlign());
    const res = await fetch('/__look-align', { method: 'POST', body }).catch(() => null);
    if (res?.ok) {
      this.saved = body;
      this.refresh();
    } else this.status.setText('บันทึกไม่ได้: ต้องเปิดผ่าน npm run dev').setColor('#ff8a8a');
  }
}
