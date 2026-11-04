import Phaser from 'phaser';
import { ART_SCALE, gunLook, iconTexture, lookRes, lookTexture } from '../art/chibi';
import { ITEMS, SKILLS, WEAPONS, WeaponId } from '../core/data';
import { skillOf } from '../core/Actions';
import { TUNING, tankCentre } from '../core/World';
import { Button, FONT, INK, TEAM_COLORS, label } from '../ui/widgets';
import BattleScene, { AIM_HOLD_MS, hpColor } from './BattleScene';
import { isMuted, setMuted } from '../audio/sfx';
import { account } from '../net/account';
import { net } from '../net/NetClient';
import { DIFF_LABEL, FORMAT_LABEL } from './setup';

// Screen-space HUD, run in parallel with BattleScene so it never moves with the camera.
// Reads the battle's public state each frame and calls its command methods.

const POWER = { x: 560, y: 1000, w: 800, h: 34 };
const WIND = { x: 960, y: 88, r: 36 };
const DIAL = { x: 430, y: 1002, r: 64 };
const SLOT_NAME: Record<WeaponId, string> = { cannon: 'ปืนใหญ่', hammer: 'ค้อนหิน', splitter: 'จรวดแตก', shovel: 'พลั่ว', drill: 'สว่าน' };

interface Panel {
  hp: Phaser.GameObjects.Text;
  x: number;
  y: number;
  right: boolean;
}

export default class HudScene extends Phaser.Scene {
  private battle!: BattleScene;
  private g!: Phaser.GameObjects.Graphics;
  private panels = new Map<number, Panel>();
  private t!: Record<'turn' | 'net' | 'wind' | 'windTag' | 'timer' | 'angle' | 'power' | 'shot' | 'help' | 'banner', Phaser.GameObjects.Text>;
  private slots!: { main: Button; drill: Button; items: Button[]; skill: Button };
  private touchUi: Phaser.GameObjects.GameObject[] = [];
  private aimHold = { dir: 0, since: 0 };
  private soundBtn!: Button;

  constructor() {
    super('hud');
  }

  init(): void {
    this.panels = new Map();
    this.touchUi = [];
    this.aimHold = { dir: 0, since: 0 };
  }

  create(): void {
    this.battle = this.scene.get('battle') as BattleScene;
    this.g = this.add.graphics();
    this.createPanels();
    this.t = {
      turn: label(this, 960, 10, '', 26).setOrigin(0.5, 0),
      net: label(this, 960, 200, '', 30, '#ff8787').setOrigin(0.5, 0),
      wind: label(this, WIND.x, WIND.y, '', 32).setOrigin(0.5),
      windTag: label(this, WIND.x, WIND.y + WIND.r + 6, '', 18).setOrigin(0.5, 0),
      timer: label(this, WIND.x + 120, WIND.y, '', 34).setOrigin(0.5),
      angle: label(this, DIAL.x, DIAL.y + 22, '', 30).setOrigin(0.5),
      power: label(this, POWER.x + POWER.w + 22, POWER.y + POWER.h / 2, '', 34).setOrigin(0, 0.5),
      shot: label(this, 960, 160, '', 24, '#ffe8a3').setOrigin(0.5, 0),
      help: label(this, 1900, 1066, '', 17).setOrigin(1, 1).setAlign('right'),
      banner: label(this, 960, 380, '', 72).setOrigin(0.5).setAlpha(0),
    };
    this.t.help.setText('←→ เดิน/หัน  ↑↓ มุม (แตะ=1° ค้าง=เร็ว Shift=ช้า)  Space ค้าง=ชาร์จ\n1-2 อาวุธ  3-5 ไอเท็ม  E สกิล  คลิกขวาลาก=ดูแผนที่  C กล้อง  M เสียง  Esc เมนู');
    for (let i = 0; i <= 100; i += 10) {
      this.add.text(POWER.x + (POWER.w * i) / 100, POWER.y - 8, `${i}`, {
        fontFamily: FONT, fontSize: '15px', color: '#ffffff', stroke: '#1b2030', strokeThickness: 4,
      }).setOrigin(0.5, 1);
    }
    this.createSlots();
    this.createTouch();
    new Button(this, 1800, 236, 150, 52, 'เมนู', { size: 24, onClick: () => this.battle.toMenu() });
    this.soundBtn = new Button(this, 1800, 300, 150, 52, '', { size: 22, onClick: () => setMuted(!isMuted()) });

    this.battle.events.on('banner', this.showBanner, this);
    this.battle.events.on('over', this.showResult, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.battle.events.off('banner', this.showBanner, this);
      this.battle.events.off('over', this.showResult, this);
    });
  }

  // ---------------------------------------------------------------- build

  private createPanels(): void {
    const count = [0, 0];
    for (const t of this.battle.world.tanks) {
      const right = t.team !== 0;
      const i = count[t.team]++;
      const x = right ? 1880 : 40;
      const y = 22 + i * 92;
      this.add.image(right ? x - 34 : x + 34, y + 76, lookTexture(this, t.loadout)).setOrigin(0.5, 1).setScale(ART_SCALE * 1.05 * lookRes()).setFlipX(right);
      const name = t.isBot && (this.battle.net || t.team === 1) ? `${t.name} (${DIFF_LABEL[this.battle.setup.difficulty]})` : t.name;
      label(this, right ? x - 80 : x + 80, y, `${name} · ${WEAPONS[t.loadout.weapon].name}`, 22).setOrigin(right ? 1 : 0, 0);
      const hp = label(this, right ? x - 80 : x + 80, y + 52, '', 18).setOrigin(right ? 1 : 0, 0);
      this.panels.set(t.id, { hp, x, y, right });
    }
  }

  private createSlots(): void {
    const b = this.battle;
    const y = 935;
    const mk = (x: number, w: number, onClick: () => void) => {
      const btn = new Button(this, x, y, w, 72, '', { size: 21, onClick });
      btn.text.setLineSpacing(-2);
      return btn;
    };
    this.slots = {
      main: mk(600, 170, () => b.selectWeapon(false)),
      drill: mk(785, 170, () => b.selectWeapon(true)),
      items: [0, 1, 2].map((i) => mk(965 + i * 155, 140, () => b.useItemSlot(i))),
      skill: mk(1445, 170, () => b.useSkillNow()),
    };
  }

  private createTouch(): void {
    const b = this.battle;
    const hold = (x: number, y: number, r: number, str: string, down: () => void, up: () => void, fill = 0x2b3350) =>
      new Button(this, x, y, r * 2, r * 2, str, {
        circle: true, size: Math.round(r * 0.55), fill,
        onDown: (p) => { b.uiPointers.add(p.id); down(); },
        onUp: (p) => { b.uiPointers.delete(p.id); up(); },
      });
    const aimDown = (d: number) => () => {
      b.nudgeAngle(d); // a tap is exactly 1°
      this.aimHold = { dir: d, since: this.time.now };
    };
    const aimUp = () => {
      this.aimHold.dir = 0;
      b.touch.aim = 0;
    };
    this.touchUi = [
      hold(100, 990, 66, '◀', () => (b.touch.move = -1), () => (b.touch.move = 0)),
      hold(270, 990, 66, '▶', () => (b.touch.move = 1), () => (b.touch.move = 0)),
      hold(100, 820, 58, 'มุม+', aimDown(1), aimUp),
      hold(270, 820, 58, 'มุม−', aimDown(-1), aimUp),
      hold(1790, 960, 100, 'ยิง', () => (b.touch.fire = true), () => (b.touch.fire = false), 0xd9480f),
      hold(1790, 790, 46, 'กล้อง', () => b.recenter(), () => {}),
    ];
    // Show touch buttons on touch devices; hide them as soon as a mouse moves.
    this.setTouchVisible(this.sys.game.device.input.touch);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.wasTouch) this.setTouchVisible(true); });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (!p.wasTouch && !p.isDown) this.setTouchVisible(false); });
  }

  private setTouchVisible(v: boolean): void {
    for (const o of this.touchUi) (o as Button).setVisible(v);
    this.t.help.setVisible(!v);
  }

  // ---------------------------------------------------------------- events

  private showBanner(text: string, color: number): void {
    const b = this.t.banner;
    b.setText(text).setColor(Phaser.Display.Color.IntegerToColor(color).rgba).setAlpha(1).setScale(1.3);
    this.tweens.killTweensOf(b);
    this.tweens.add({ targets: b, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: 1000, duration: 400 });
  }

  private showResult(winner: number): void {
    this.time.delayedCall(900, () => {
      const b = this.battle;
      const c = this.add.container(960, 520);
      const g = this.add.graphics();
      g.fillStyle(INK, 0.92);
      g.fillRoundedRect(-480, -330, 960, 660, 28);
      const won = winner === b.myTeam;
      g.lineStyle(6, won ? 0xffd166 : 0x8899aa, 1);
      g.strokeRoundedRect(-480, -330, 960, 660, 28);
      const title = won ? 'ชนะ!' : winner === -1 ? 'เสมอ' : 'แพ้...';
      // ranked: the new rating arrives a moment after the result
      const rating = label(this, 0, 150, 'กำลังคิดคะแนน…', 34, '#ffd166').setOrigin(0.5, 0);
      if (!net.room?.ranked) rating.setText('');
      const showRating = () => {
        if (!b.net) return; // offline matches pay nothing
        const d = account.lastChange;
        const pay = account.lastReward;
        const parts: string[] = [];
        if (d !== null && account.view && net.room?.ranked) parts.push(`คะแนน ${d >= 0 ? '+' : ''}${d} → ${account.view.rating}`);
        if (pay) parts.push(`+${pay.coins} 🪙${pay.xp ? `  +${pay.xp} XP` : ''}`);
        if (parts.length) rating.setText(parts.join('   '));
      };
      showRating();
      const stop = account.onChange(showRating);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
      const lines = b.world.tanks.map((t) => {
        const s = b.stats.get(t.id)!;
        const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
        return `${t.name.padEnd(10)} ดาเมจ ${String(s.damage).padStart(4)}   แม่น ${acc}%   ${t.alive ? `HP ${t.hp}` : 'ออกแล้ว'}`;
      });
      c.add([
        g,
        label(this, 0, -290, title, 96, won ? '#ffd166' : '#ffffff').setOrigin(0.5, 0),
        label(this, 0, -170, `${b.net ? `ออนไลน์ ${b.setup.format}` : FORMAT_LABEL[b.setup.format]} · บอท${DIFF_LABEL[b.setup.difficulty]} · ${b.turns.turnNumber} เทิร์น`, 26).setOrigin(0.5, 0),
        this.add.text(0, -110, lines.join('\n'), { fontFamily: FONT, fontSize: '28px', color: '#e6ecff', lineSpacing: 12, align: 'left' }).setOrigin(0.5, 0),
        ...(b.net && net.room?.ranked
          ? [rating, new Button(this, 0, 240, 420, 96, 'กลับเมนู', {
            fill: 0x2f9e44, size: 36, onClick: () => {
              net.leave();
              b.scene.start('menu');
            },
          })]
          : b.net
          ? [rating, new Button(this, 0, 240, 420, 96, 'กลับห้อง', { fill: 0x2f9e44, size: 36, onClick: () => b.scene.start('lobby') })]
          : [
            new Button(this, -200, 240, 340, 96, 'เล่นอีกครั้ง', { fill: 0x2f9e44, size: 36, onClick: () => b.scene.restart() }),
            new Button(this, 200, 240, 340, 96, 'เปลี่ยนตัว/ด่าน', { size: 32, onClick: () => b.scene.start('setup') }),
          ]),
      ]);
      c.setScale(0.8).setAlpha(0);
      this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    });
  }

  // ---------------------------------------------------------------- per frame

  /** Round wind gauge: strength in the middle, chevrons on the side it blows toward. */
  private drawWind(g: Phaser.GameObjects.Graphics, time: number): void {
    const b = this.battle;
    const calm = b.mods.noWind && b.phase !== 'settle' && b.phase !== 'over';
    const wind = calm ? 0 : b.world.wind;
    const { x, y, r } = WIND;
    g.fillStyle(INK, 0.85);
    g.fillCircle(x, y, r + 6);
    g.lineStyle(4, calm ? 0x8ef0ff : 0xffffff, 0.9);
    g.strokeCircle(x, y, r);
    const dir = Math.sign(wind);
    const n = Math.abs(wind);
    const drift = (time / 120) % 8; // chevrons slide in the wind direction
    for (let i = 0; i < n; i++) {
      const cx = x + dir * (r + 16 + i * 15 + drift);
      const alpha = 1 - i * 0.12;
      g.fillStyle(0x8ecae6, alpha);
      g.fillTriangle(cx + dir * 9, y, cx - dir * 3, y - 11, cx - dir * 3, y + 11);
    }
    this.t.wind.setText(`${n}`);
    this.t.windTag.setText(calm ? 'ไร้ลม' : 'ลม');
  }

  /** Angle gauge: a quarter dial mirrored to the facing side, with a needle. */
  private drawAngleDial(g: Phaser.GameObjects.Graphics): void {
    const t = this.battle.active;
    const { x, y, r } = DIAL;
    const f = t.facing;
    const at = (deg: number) => (f > 0 ? -deg : 180 + deg) * (Math.PI / 180);
    g.fillStyle(INK, 0.85);
    g.fillCircle(x, y, r + 8);
    g.lineStyle(3, 0xffffff, 0.35);
    g.strokeCircle(x, y, r);
    g.lineStyle(10, 0xffd166, 0.25);
    g.beginPath();
    g.arc(x, y, r - 8, Math.min(at(0), at(90)), Math.max(at(0), at(90)), false);
    g.strokePath();
    for (let d = 0; d <= 90; d += 10) {
      const long = d % 30 === 0;
      const a = at(d);
      g.lineStyle(long ? 3 : 2, 0xffffff, 0.9);
      g.lineBetween(x + Math.cos(a) * (r - (long ? 18 : 12)), y + Math.sin(a) * (r - (long ? 18 : 12)), x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4));
    }
    const last = this.battle.lastAngle.get(t.id);
    if (last !== undefined) {
      const a = at(last);
      g.lineStyle(4, 0xff4d4d, 1);
      g.lineBetween(x + Math.cos(a) * (r - 20), y + Math.sin(a) * (r - 20), x + Math.cos(a) * (r + 2), y + Math.sin(a) * (r + 2));
    }
    const a = at(t.angle);
    g.lineStyle(5, 0xffd166, 1);
    g.lineBetween(x, y, x + Math.cos(a) * (r - 10), y + Math.sin(a) * (r - 10));
    g.fillStyle(0xffd166, 1);
    g.fillCircle(x, y, 7);
    this.t.angle.setText(`${Math.round(t.angle)}°`).setX(x - f * 22);
  }

  update(time: number): void {
    const b = this.battle;
    if (!b.turns) return;
    const g = this.g;
    g.clear();
    const active = b.active;
    const human = b.isLocal(active);
    this.t.net.setText(b.net && !net.connected ? 'หลุดการเชื่อมต่อ กำลังต่อใหม่…' : b.phase === 'wait' && b.isLocal(active) ? 'รอเซิร์ฟเวอร์…' : '');

    if (this.aimHold.dir && time - this.aimHold.since > AIM_HOLD_MS) b.touch.aim = this.aimHold.dir;
    this.soundBtn.setLabel(isMuted() ? 'เสียง: ปิด' : 'เสียง: เปิด');

    // HP panels, with each character's place in the delay queue
    const order = b.turns.order();
    const waiting = order.filter((t) => t !== active);
    const base = waiting.length ? Math.min(...waiting.map((t) => t.delay)) : 0;
    for (const t of b.world.tanks) {
      const p = this.panels.get(t.id)!;
      const w = 300;
      const bx = p.right ? p.x - 80 - w : p.x + 80;
      g.fillStyle(INK, 0.85);
      g.fillRoundedRect(bx - 4, p.y + 30, w + 8, 20, 7);
      g.fillStyle(t.alive ? hpColor(t.hp, t.maxHp) : 0x555555, 1);
      const fw = (w * t.hp) / t.maxHp;
      if (fw > 0) g.fillRoundedRect(p.right ? bx + w - fw : bx, p.y + 33, Math.max(fw, 4), 14, 5);
      if (t === active && b.phase !== 'over') {
        g.lineStyle(4, 0xffd166, 1);
        g.strokeRoundedRect(bx - 6, p.y + 28, w + 12, 24, 8);
      }
      const pos = waiting.indexOf(t);
      const queue = !t.alive || b.phase === 'over' ? '' : t === active ? 'ตานี้' : pos === 0 ? 'ตาถัดไป' : `คิว ${pos + 1} (ดีเลย์ +${t.delay - base})`;
      const tags = [t.alive ? `${t.hp}` : 'ออกแล้ว', queue, t.armored ? 'เกราะ' : '', t.burrowed ? 'มุดดิน' : ''].filter(Boolean);
      p.hp.setText(tags.join(' · '));
    }

    // turn, wind, timer
    const sd = b.turns.suddenDeath ? '  · Sudden death' : '';
    this.t.turn.setText(`เทิร์น ${b.turns.turnNumber} — ${human ? 'ตาของคุณ' : `ตาของ${active.name}`}${sd}`);
    this.drawWind(g, time);
    const left = Math.ceil(b.turns.timeLeft);
    this.t.timer.setText(b.phase === 'aim' ? `${left}` : '').setColor(left <= 5 ? '#ff6b6b' : '#ffffff');
    if (b.phase === 'aim') {
      g.fillStyle(INK, 0.85);
      g.fillCircle(WIND.x + 120, WIND.y, 30);
      g.lineStyle(5, left <= 5 ? 0xff6b6b : 0x8ecae6, 1);
      g.beginPath();
      g.arc(WIND.x + 120, WIND.y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (b.turns.timeLeft / TUNING.turnSeconds), false);
      g.strokePath();
    }
    this.t.shot.setText(b.lastShotText ? `นัดล่าสุด: ${b.lastShotText}` : '');

    this.drawAngleDial(g);
    this.drawPower(g, active.id);
    this.updateSlots(human);
    this.drawOffscreenArrows(g);
  }

  /** Power bar: green→yellow→red fill, 10-step ticks, bold quarters, a marker for last shot's power. */
  private drawPower(g: Phaser.GameObjects.Graphics, activeId: number): void {
    const b = this.battle;
    const { x, y, w, h } = POWER;
    g.fillStyle(INK, 0.85);
    g.fillRoundedRect(x - 6, y - 6, w + 12, h + 12, 10);
    g.fillStyle(0x0f1424, 1);
    g.fillRect(x, y, w, h);
    // fill in three gradient segments so the colour tracks the power
    const stops = [[0, 0x4ade80], [0.5, 0xfacc15], [1, 0xef4444]] as const;
    const fw = (w * b.power) / 100;
    for (let i = 0; i < 2; i++) {
      const [p0, c0] = stops[i];
      const [p1, c1] = stops[i + 1];
      const sx = x + w * p0;
      const ex = Math.min(x + fw, x + w * p1);
      if (ex <= sx) break;
      g.fillGradientStyle(c0, c1, c0, c1, 1);
      g.fillRect(sx, y, ex - sx, h);
    }
    g.fillStyle(0xffffff, 0.18);
    g.fillRect(x, y + 3, fw, h * 0.3); // gloss
    for (let i = 1; i < 10; i++) {
      g.fillStyle(0xffffff, 0.2);
      g.fillRect(x + (w * i) / 10 - 1, y, 2, h);
    }
    // quarters, for eyeballing a fixed power
    for (let i = 1; i < 4; i++) {
      g.fillStyle(0xffffff, 0.65);
      g.fillRect(x + (w * i) / 4 - 2, y - 3, 4, h + 6);
    }
    const last = b.lastPower.get(activeId);
    if (last !== undefined) {
      const mx = x + (w * last) / 100;
      g.fillStyle(0xff4d4d, 1);
      g.fillRect(mx - 2, y - 4, 4, h + 8);
      g.fillTriangle(mx - 9, y + h + 14, mx + 9, y + h + 14, mx, y + h + 4);
    }
    // fuel, under the power bar
    g.fillStyle(INK, 0.85);
    g.fillRoundedRect(x - 6, y + h + 16, w + 12, 12, 6);
    g.fillStyle(0x8ecae6, 1);
    g.fillRoundedRect(x - 2, y + h + 18, Math.max(1, ((w + 4) * b.turns.fuel) / (TUNING.fuelPerTurn * b.active.move)), 8, 4);
    this.t.power.setText(`${Math.round(b.power)}`);
  }

  private updateSlots(human: boolean): void {
    const b = this.battle;
    const t = b.active;
    const can = human && b.humanCanAct;
    const s = this.slots;
    const main = WEAPONS[t.loadout.weapon];
    s.main.setLabel(`1 ${SLOT_NAME[main.id]}`).setIcon(this.gunIcon(main.id)).setSelected(!b.useDrill).setEnabled(can);
    s.drill.setLabel(`2 สว่าน ×${t.drillLeft}`).setIcon(this.gunIcon('drill')).setSelected(b.useDrill).setEnabled(can && t.drillLeft > 0);
    s.items.forEach((btn, i) => {
      const item = t.items[i];
      btn.setLabel(`${i + 3} ${item ? ITEMS[item].name : '—'}`).setIcon(item ? iconTexture(this, item) : null).setSelected(false).setEnabled(can && !!item && !b.mods.itemUsed);
    });
    const skillId = skillOf(t);
    const cd = t.skillCooldown;
    s.skill.setLabel(!skillId ? 'E —' : cd > 0 ? `E รอ ${cd} ตา` : `E ${SKILLS[skillId].name}`)
      .setIcon(skillId ? iconTexture(this, skillId) : null)
      .setEnabled(can && !!skillId && cd === 0 && !b.mods.skillUsed);
    for (const btn of [s.main, s.drill, ...s.items, s.skill]) btn.setVisible(human && b.phase !== 'over');
  }

  private gunIcon(id: WeaponId): string | null {
    const look = gunLook(this, id);
    return look.key.startsWith('art-') ? look.key : null;
  }

  /** Arrows at the screen edge pointing at characters outside the camera view. */
  private drawOffscreenArrows(g: Phaser.GameObjects.Graphics): void {
    const b = this.battle;
    const view = b.cameras.main.worldView;
    for (const t of b.world.tanks) {
      if (!t.alive) continue;
      const c = tankCentre(t);
      if (view.contains(c.x, c.y)) continue;
      const sx = Phaser.Math.Clamp(((c.x - view.x) / view.width) * 1920, 40, 1880);
      const sy = Phaser.Math.Clamp(((c.y - view.y) / view.height) * 1080, 220, 800);
      const ang = Math.atan2(c.y - (view.y + view.height / 2), c.x - (view.x + view.width / 2));
      const tip = { x: sx + Math.cos(ang) * 22, y: sy + Math.sin(ang) * 22 };
      const l = { x: sx + Math.cos(ang + 2.5) * 18, y: sy + Math.sin(ang + 2.5) * 18 };
      const r = { x: sx + Math.cos(ang - 2.5) * 18, y: sy + Math.sin(ang - 2.5) * 18 };
      g.fillStyle(TEAM_COLORS[t.team], 0.95);
      g.fillTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
      g.lineStyle(3, 0xffffff, 1);
      g.strokeTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
    }
  }
}
