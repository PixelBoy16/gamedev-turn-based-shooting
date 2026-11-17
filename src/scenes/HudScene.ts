import Phaser from 'phaser';
import { ART_SCALE, gunLook, iconTexture, lookRes, lookTexture } from '../art/chibi';
import { ITEMS, SKILLS, WEAPONS, WeaponId } from '../core/data';
import { skillOf } from '../core/Actions';
import { TUNING, Tank, tankCentre } from '../core/World';
import { Button, FONT, TEAM_COLORS, fit, label } from '../ui/widgets';
import { THEME, drawPlate, drawRibbon, platePoints } from '../ui/theme';
import { Box, PlateButton, STROKE, filled, fitted, mockupBox, placed } from '../ui/plates';
import BattleScene, { AIM_HOLD_MS } from './BattleScene';
import { isMuted, setMuted } from '../audio/sfx';
import { account } from '../net/account';
import { net } from '../net/NetClient';
import { DIFF_LABEL, FORMAT_LABEL } from './setup';

// Screen-space HUD, run in parallel with BattleScene so it never moves with the camera.
// Reads the battle's public state each frame and calls its command methods.
// Built to the painted battle mockup (new_ui/black-boom-battle-parts 2/layout.json, 1672x941).

const box = (b: Box): Box => mockupBox(b, 1672);
const K = 1920 / 1672;
const U = (name: string) => `ui-battle/${name}`;
const SLOT_NAME: Record<WeaponId, string> = {
  cannon: 'ปืนใหญ่', hammer: 'ค้อนหิน', splitter: 'จรวดแตก', shovel: 'พลั่ว', drill: 'สว่าน',
  bouncer: 'ลูกเด้ง', beam: 'ลำแสง', mortar: 'ครก', magnet: 'แม่เหล็ก', dirtbomb: 'ระเบิดดิน',
};
/** The six slots on the control bar, in mockup px (weapon, drill, three items, skill). */
const SLOT_BOXES: Box[] = [[380, 733, 164, 94], [554, 733, 156, 94], [720, 733, 154, 94], [882, 733, 146, 94], [1041, 733, 156, 94], [1209, 733, 156, 94]];
/** Power rail: where 0 and 100 sit (mockup px) and its row. */
const POWER = { x0: 423, x1: 1269, y: 878, h: 24 };
/** Angle gauge pivot (mockup px). */
const DIAL = { x: 283, y: 831, r: 66 };

interface Panel {
  tank: Tank;
  avatar: Phaser.GameObjects.Image;
  /** The avatar plate's resting scale (x, y): it is stretched to its box. */
  avatarScale: [number, number];
  portrait: Phaser.GameObjects.Image;
  fill: Phaser.GameObjects.Image;
  right: boolean;
  hp: Phaser.GameObjects.Text;
  tags: Phaser.GameObjects.Text;
}

interface Slot {
  btn: PlateButton;
  icon: Phaser.GameObjects.Image;
  caption: Phaser.GameObjects.Text;
  pick: Phaser.GameObjects.Image;
}

/** Bold white HUD text with the navy outline. */
function hudText(scene: Phaser.Scene, size: number, color = '#ffffff', stroke = Math.max(3, Math.round(size / 7))): Phaser.GameObjects.Text {
  return scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: STROKE, strokeThickness: stroke });
}

/** Swap an image's texture and fit it inside w×h. */
function refit(img: Phaser.GameObjects.Image, key: string, w: number, h: number): void {
  if (img.texture.key !== key) img.setTexture(key);
  img.setScale(Math.min(w / img.width, h / img.height));
}

export default class HudScene extends Phaser.Scene {
  private battle!: BattleScene;
  private g!: Phaser.GameObjects.Graphics;
  private panels: Panel[] = [];
  private t!: Record<'turn' | 'net' | 'timer' | 'windTag' | 'wind' | 'angle' | 'shot' | 'damage' | 'help' | 'banner', Phaser.GameObjects.Text>;
  private img!: Record<'windArrows' | 'shotStrip' | 'crown' | 'gauge' | 'needle' | 'powerFill' | 'handle' | 'max', Phaser.GameObjects.Image>;
  private slots: Slot[] = [];
  private fire!: PlateButton;
  private surrender!: { btn: PlateButton; caption: Phaser.GameObjects.Text; armed: Phaser.Time.TimerEvent | null };
  private touchUi: Phaser.GameObjects.GameObject[] = [];
  private aimHold = { dir: 0, since: 0 };
  private closeGear: (() => void) | null = null;

  constructor() {
    super('hud');
  }

  init(): void {
    this.panels = [];
    this.slots = [];
    this.touchUi = [];
    this.aimHold = { dir: 0, since: 0 };
    this.closeGear = null;
  }

  create(): void {
    this.battle = this.scene.get('battle') as BattleScene;
    this.createTop();
    this.createBar();
    this.g = this.add.graphics();
    this.createPanels();
    this.createTouch();
    const net_ = label(this, 960, 250, '', 30, '#ff8787').setOrigin(0.5, 0);
    const help = label(this, 1900, 812, '', 17).setOrigin(1, 1).setAlign('right').setAlpha(0.85);
    help.setText('←→ เดิน/หัน  ↑↓ มุม (แตะ=1° ค้าง=เร็ว Shift=ช้า)  Space ค้าง=ชาร์จ\n1-2 อาวุธ  3-5 ไอเท็ม  E สกิล  คลิกขวาลาก=ดูแผนที่  C กล้อง  M เสียง  Esc เมนู');
    const banner = hudText(this, 84, '#00baff', 10).setPosition(960, box([0, 311, 0, 0])[1]).setOrigin(0.5).setAlpha(0);
    Object.assign(this.t, { net: net_, help, banner });
    this.setTouchVisible(this.sys.game.device.input.touch);

    this.battle.events.on('banner', this.showBanner, this);
    this.battle.events.on('over', this.showResult, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.battle.events.off('banner', this.showBanner, this);
      this.battle.events.off('over', this.showResult, this);
    });
  }

  // ---------------------------------------------------------------- build

  /** Turn banner, wind panel with the countdown in its middle, last-shot strip, the gear. */
  private createTop(): void {
    filled(this, U('banner'), box([642, 1, 397, 59]));
    const [tx, ty, tw, th] = box([676, 9, 335, 44]);
    const turn = hudText(this, 36, '#101322', 0).setPosition(tx + tw / 2, ty + th / 2).setOrigin(0.5);
    filled(this, U('wind-panel'), box([602, 68, 469, 84]));
    const windArrows = placed(this, U('wind-arrows'), box([636, 83, 65, 54]));
    filled(this, U('timer'), box([716, 58, 108, 105]));
    const [cx, cy, cw, ch] = box([738, 75, 62, 66]);
    const timer = hudText(this, 64, '#ffffff', 7).setPosition(cx + cw / 2, cy + ch / 2).setOrigin(0.5);
    placed(this, U('wind'), box([880, 80, 63, 54]));
    const [lx, ly, lw, lh] = box([963, 76, 43, 26]);
    const windTag = hudText(this, 27, '#b5edff', 4).setPosition(lx + lw / 2, ly + lh / 2).setOrigin(0.5);
    const [vx, vy, vw, vh] = box([956, 102, 55, 34]);
    const wind = hudText(this, 36, '#ffffff', 5).setPosition(vx + vw / 2, vy + vh / 2).setOrigin(0.5);

    const shotStrip = filled(this, U('last-shot'), box([625, 169, 422, 35]));
    const crown = placed(this, U('crown'), box([656, 166, 38, 35]));
    const [, sy, , sh] = box([0, 170, 0, 32]);
    const shot = hudText(this, 28, '#ffffff', 4).setPosition(0, sy + sh / 2).setOrigin(0, 0.5);
    const damage = hudText(this, 30, '#ffe500', 4).setPosition(0, sy + sh / 2).setOrigin(0, 0.5);

    // the gear: sound and camera; sits lower in 2v2, under the second enemy card
    const two = this.battle.world.tanks.some((t, i, all) => all.findIndex((o) => o.team === t.team) !== i);
    const gear: PlateButton = new PlateButton(this, U('btn-gear'), box([1564, two ? 262 : 151, 90, 76]), () => {
      if (this.closeGear) this.closeGear();
      else this.closeGear = this.gearMenu(gear);
    }, [0, 0, 1, 1]);
    gear.put(fitted(this, U('gear'), gear.w * 0.52, gear.h * 0.64), 0.5, 0.5);

    this.t = { turn, timer, windTag, wind, shot, damage } as HudScene['t'];
    this.img = { windArrows, shotStrip, crown } as HudScene['img'];
  }

  /** The control bar: surrender, angle gauge, six slots, power rail, fire. */
  private createBar(): void {
    const b = this.battle;
    filled(this, U('bar'), box([24, 715, 1631, 216]));

    // surrender asks twice: the first tap arms it for a few seconds
    const sBtn = new PlateButton(this, U('btn-surrender'), box([40, 782, 145, 130]), () => this.onSurrender(), [0, 0, 1, 1]);
    sBtn.put(fitted(this, U('flag'), sBtn.w * 0.45, sBtn.h * 0.46), 0.535, 0.31);
    const sCap = hudText(this, 29, '#ffffff', 5).setText('ยอมแพ้').setOrigin(0.5);
    sBtn.put(fit(sCap, sBtn.w * 0.84, sBtn.h * 0.32), 0.5, 0.71);
    this.surrender = { btn: sBtn, caption: sCap, armed: null };

    // angle: the painted dial, its needle turned by the aim (flipped when facing left)
    const gauge = filled(this, U('gauge'), box([205, 751, 159, 166]));
    const [nx, ny] = box([DIAL.x, DIAL.y, 0, 0]);
    const needle = this.add.image(nx, ny, U('needle')).setOrigin(13 / 90, 0.5).setDisplaySize(90 * K, 36 * K);
    const [ax, ay, aw, ah] = box([232, 841, 88, 46]);
    const angle = hudText(this, 42, '#ffffff', 6).setPosition(ax + aw / 2, ay + ah / 2).setOrigin(0.5);

    // six slots
    SLOT_BOXES.forEach((sb, i) => {
      const onClick = () => {
        if (i === 0) b.selectWeapon(false);
        else if (i === 1) b.selectWeapon(true);
        else if (i === 5) b.useSkillNow();
        else b.useItemSlot(i - 2);
      };
      const btn = new PlateButton(this, U('item'), box(sb), onClick, [0, 0, 1, 1]);
      const icon = this.add.image(0, 0, U('lock'));
      btn.put(icon, 0.325, 0.405);
      const caption = hudText(this, 27, '#ffffff', 4).setOrigin(0.5);
      btn.put(caption, 0.625, 0.7);
      const pick = this.add.image(0, 0, U('selection')).setDisplaySize(btn.w, btn.h);
      btn.put(pick, 0.5, 0.5);
      this.slots.push({ btn, icon, caption, pick });
    });

    // power: rail, gold fill cropped to the charge, ticks, numbers, handle, last shot's power in red
    filled(this, U('power-rail'), box([414, 868, 872, 48]));
    const powerFill = filled(this, U('power-fill'), box([POWER.x0, POWER.y, POWER.x1 - POWER.x0, POWER.h]));
    filled(this, U('power-ticks'), box([427, 867, 848, 42]));
    for (let i = 0; i <= 10; i++) {
      const [x, y, w, h] = box([407 + 84.7 * i, 833, 43, 31]);
      hudText(this, 26, '#ffffff', 4).setText(`${i * 10}`).setPosition(x + w / 2, y + h / 2).setOrigin(0.5);
    }
    const max = filled(this, U('power-max'), box([0, 860, 23, 57]));
    const handle = filled(this, U('power-handle'), box([0, 862, 22, 54]));

    // fire: hold to charge, let go to shoot (same as holding Space)
    this.fire = new PlateButton(this, U('btn-fire'), box([1382, 750, 268, 170]), () => undefined, [0, 0, 1, 1]);
    this.fire.put(fitted(this, U('fire-bomb'), this.fire.w * 0.46, this.fire.h * 0.61), 0.6, 0.455);
    const fireText = hudText(this, 66, '#ffffff', 8).setText('ยิง!').setOrigin(0.5);
    this.fire.put(fit(fireText, this.fire.w * 0.65, this.fire.h * 0.47), 0.515, 0.645);
    const zone = this.fire.list[1] as Phaser.GameObjects.Zone;
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.fire.enabled) return;
      b.uiPointers.add(p.id);
      b.touch.fire = true;
    });
    const release = (p: Phaser.Input.Pointer) => {
      b.uiPointers.delete(p.id);
      b.touch.fire = false;
    };
    zone.on('pointerup', release);
    zone.on('pointerout', release);

    Object.assign(this.img, { gauge, needle, powerFill, handle, max });
    this.t.angle = angle;
  }

  /** One card per character: hexagon portrait, name plate, HP bar with the numbers, queue tags. 2v2's second card is smaller, under the first. */
  private createPanels(): void {
    const count = [0, 0];
    for (const t of this.battle.world.tanks) {
      const right = t.team !== 0;
      const i = count[t.team]++;
      const s = i === 0 ? 1 : 0.72;
      const ax = right ? 1650 : 32;
      const ay = 16;
      const at = (b: Box): Box => box([ax + (b[0] - ax) * s, ay + i * 140 + (b[1] - ay) * s, b[2] * s, b[3] * s]);
      const side = right ? 'red' : 'blue';
      filled(this, U(`name-${side}`), at(right ? [1219, 24, 328, 44] : [145, 20, 299, 50]));
      filled(this, U('hp-rail'), at(right ? [1158, 65, 396, 55] : [112, 64, 398, 56]));
      const fill = filled(this, U('hp-fill'), at(right ? [1171, 78, 365, 27] : [148, 78, 344, 27]));
      const avatar = filled(this, U(`avatar-${side}`), at(right ? [1520, 17, 130, 107] : [32, 16, 136, 111]));
      const portrait = this.portrait(t, at(right ? [1544, 28, 84, 84] : [55, 30, 84, 80]));

      const name = t.isBot && (this.battle.net || t.team === 1) ? `${t.name} (${DIFF_LABEL[this.battle.setup.difficulty]})` : t.name;
      const [nx, ny, nw, nh] = at(right ? [1242, 23, 285, 39] : [174, 24, 270, 36]);
      const nameText = hudText(this, Math.round(31 * s), '#ffffff', 4).setText(`${name} · ${WEAPONS[t.loadout.weapon].name}`);
      fit(nameText.setOrigin(right ? 1 : 0, 0.5).setPosition(right ? nx + nw : nx, ny + nh / 2), nw, nh * 1.2);
      const [hx, hy, hw, hh] = at(right ? [1348, 74, 180, 33] : [178, 74, 185, 33]);
      const hp = hudText(this, Math.round(31 * s), '#ffffff', 4).setOrigin(right ? 1 : 0, 0.5).setPosition(right ? hx + hw : hx, hy + hh / 2);
      const [gx, gy] = at(right ? [1528, 121, 0, 0] : [178, 121, 0, 0]);
      const tags = hudText(this, Math.round(21 * s), '#ffe8a3', 4).setOrigin(right ? 1 : 0, 0).setPosition(gx, gy);
      this.panels.push({ tank: t, avatar, avatarScale: [avatar.scaleX, avatar.scaleY], portrait, fill, right, hp, tags });
    }
  }

  /** The head and shoulders of a character's look, cropped into a box. */
  private portrait(t: Tank, [x, y, w, h]: Box): Phaser.GameObjects.Image {
    const img = this.add.image(0, 0, lookTexture(this, t.loadout)).setOrigin(0, 0);
    const W = img.width;
    const fx = 0.12;
    const fw = 0.76;
    const s = w / (fw * W);
    const cy = img.height * 0.01;
    img.setCrop(fx * W, cy, fw * W, h / s).setScale(s).setPosition(x - fx * W * s, y - cy * s);
    // the right-hand fighters face left, toward the middle
    if (t.team !== 0) img.setFlipX(true);
    return img;
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
    // above the control bar; the bar's own fire button does the shooting
    this.touchUi = [
      hold(100, 730, 62, '◀', () => (b.touch.move = -1), () => (b.touch.move = 0)),
      hold(260, 730, 62, '▶', () => (b.touch.move = 1), () => (b.touch.move = 0)),
      hold(100, 580, 54, 'มุม+', aimDown(1), aimUp),
      hold(260, 580, 54, 'มุม−', aimDown(-1), aimUp),
      hold(1800, 750, 46, 'กล้อง', () => b.recenter(), () => {}),
    ];
    // Show touch buttons on touch devices; hide them as soon as a mouse moves.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.wasTouch) this.setTouchVisible(true); });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (!p.wasTouch && !p.isDown) this.setTouchVisible(false); });
  }

  private setTouchVisible(v: boolean): void {
    for (const o of this.touchUi) (o as Button).setVisible(v);
    this.t.help.setVisible(!v);
  }

  /** First tap arms it (the caption asks to confirm); a second tap within 3 s leaves the match. */
  private onSurrender(): void {
    const s = this.surrender;
    if (s.armed) {
      s.armed.remove();
      this.battle.toMenu();
      return;
    }
    s.caption.setText('แน่ใจ? กดอีกที');
    fit(s.caption.setScale(1), s.btn.w * 0.84, s.btn.h * 0.32);
    s.armed = this.time.delayedCall(3000, () => {
      s.armed = null;
      s.caption.setText('ยอมแพ้');
      fit(s.caption.setScale(1), s.btn.w * 0.84, s.btn.h * 0.32);
    });
  }

  /** A small panel under the gear: sound on/off and camera back to the active character. Tap outside to close. */
  private gearMenu(gear: PlateButton): () => void {
    const x = gear.x + gear.w / 2 - 150;
    const y = gear.y + gear.h / 2 + 110;
    const shield = this.add.zone(960, 540, 1920, 1080).setInteractive();
    const panel = this.add.graphics({ x, y });
    drawPlate(panel, 300, 190, THEME.steelDark, { cut: 14 });
    const soundLabel = () => (isMuted() ? 'เสียง: ปิด' : 'เสียง: เปิด');
    const sound: Button = new Button(this, x, y - 42, 260, 64, soundLabel(), {
      size: 26,
      onClick: () => {
        setMuted(!isMuted());
        sound.text.setText(soundLabel());
      },
    });
    const cam = new Button(this, x, y + 42, 260, 64, 'กล้องกลับที่ตัวละคร', { size: 24, onClick: () => { close(); this.battle.recenter(); } });
    const close = () => {
      for (const o of [shield, panel, sound, cam]) o.destroy();
      this.closeGear = null;
    };
    shield.on('pointerdown', close);
    return close;
  }

  // ---------------------------------------------------------------- events

  private showBanner(text: string, color: number): void {
    const b = this.t.banner;
    b.setText(text).setColor(Phaser.Display.Color.IntegerToColor(color).rgba).setAlpha(1).setScale(1.3);
    this.tweens.killTweensOf(b);
    this.tweens.add({ targets: b, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: 1000, duration: 400 });
  }

  /**
   * End-of-match card: the screen dims, a slanted title ribbon slams in (sun rays behind it on a
   * win), then one steel row per tank slides in with its portrait, a damage bar that counts up,
   * accuracy and HP. The top damage dealer gets an MVP tag.
   */
  private showResult(winner: number): void {
    this.time.delayedCall(900, () => {
      const b = this.battle;
      const won = winner === b.myTeam;
      const draw = winner === -1;
      const edge = won ? THEME.gold : draw ? 0x8899aa : THEME.red;
      const title = won ? 'ชนะ!' : draw ? 'เสมอ' : 'แพ้...';

      const dim = this.add.rectangle(960, 540, 1920, 1080, 0x05060a, 0.62).setInteractive().setAlpha(0);
      this.tweens.add({ targets: dim, alpha: 1, duration: 300 });
      const c = this.add.container(960, 545);

      if (won) {
        // slow sun rays behind the card, fanning out from the title
        const rays = this.add.graphics({ x: 0, y: -345 }).setAlpha(0);
        rays.fillStyle(THEME.gold, 0.16);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          rays.fillTriangle(0, 0, Math.cos(a - 0.12) * 900, Math.sin(a - 0.12) * 900, Math.cos(a + 0.12) * 900, Math.sin(a + 0.12) * 900);
        }
        this.tweens.add({ targets: rays, angle: 360, duration: 30000, repeat: -1 });
        this.tweens.add({ targets: rays, alpha: 1, duration: 500, delay: 300 });
        c.add(rays);
      }

      const g = this.add.graphics();
      drawPlate(g, 1000, 690, THEME.panel, { cut: 34, rivets: true });
      g.lineStyle(5, edge, 1);
      g.strokePoints(platePoints(1000, 690, 34) as unknown as Phaser.Math.Vector2[], true, true);
      c.add(g);

      // title ribbon: a slanted plate with hazard stripes, over the top edge of the card
      const ribbon = this.add.container(0, -345);
      const r = this.add.graphics();
      drawRibbon(r, 580, 132, won ? THEME.fire : draw ? THEME.steel : 0x7a1f17, edge);
      ribbon.add([r, fit(label(this, 0, -4, title, 104, won ? '#ffe08a' : '#ffffff').setOrigin(0.5), 540, 124)]);
      ribbon.setScale(2.2).setAlpha(0);
      this.tweens.add({
        targets: ribbon, scale: 1, alpha: 1, duration: 320, delay: 150, ease: 'Back.easeOut',
        onComplete: () => this.cameras.main.shake(160, won ? 0.006 : 0.003),
      });

      const mode = `${b.net ? `ออนไลน์ ${b.setup.format}` : FORMAT_LABEL[b.setup.format]} · บอท${DIFF_LABEL[b.setup.difficulty]} · ${b.turns.turnNumber} เทิร์น`;
      c.add(label(this, 0, -248, mode, 24, THEME.muted).setOrigin(0.5));

      // stats table
      const COL = { name: -330, bar: -110, acc: 290, hp: 395 };
      const stats = b.world.tanks.map((t) => ({ t, s: b.stats.get(t.id)! }));
      const top = Math.max(...stats.map(({ s }) => s.damage));
      const ROW_H = 84;
      const firstY = -140 + ((4 - stats.length) * ROW_H) / 2; // centre 2–4 rows in the table area
      const head = (x: number, str: string) => label(this, x, firstY - 52, str, 20, THEME.muted).setOrigin(0.5);
      c.add([head(COL.bar + 140, 'ดาเมจ'), head(COL.acc, 'แม่น'), head(COL.hp, 'HP')]);
      stats.forEach(({ t, s }, i) => {
        const y = firstY + i * ROW_H;
        const row = this.add.container(0, y);
        const rg = this.add.graphics();
        const mine = t.team === b.myTeam;
        drawPlate(rg, 900, 68, mine ? 0x2c3342 : THEME.steelDark, { cut: 12 });
        rg.fillStyle(TEAM_COLORS[t.team], 1);
        rg.fillRect(-446, -26, 10, 52);
        const portrait = this.add.image(-392, 33, lookTexture(this, t.loadout)).setOrigin(0.5, 1)
          .setScale(ART_SCALE * 0.95 * lookRes()).setFlipX(t.team !== 0);
        if (!t.alive) portrait.setTint(0x666666);
        const name = fit(label(this, COL.name, 0, t.name, 28).setOrigin(0, 0.5), 230, 40);
        const mvp = top > 0 && s.damage === top;
        rg.fillStyle(0x0d0f15, 0.9);
        rg.fillRoundedRect(COL.bar, -7, 220, 14, 7);
        const bar = this.add.rectangle(COL.bar + 2, 0, 1, 10, mvp ? THEME.gold : TEAM_COLORS[t.team]).setOrigin(0, 0.5);
        const dmg = label(this, COL.bar + 232, 0, '0', 26).setOrigin(0, 0.5);
        const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
        const hp = t.alive
          ? label(this, COL.hp, 0, `${t.hp}`, 26, '#7dff8a').setOrigin(0.5)
          : label(this, COL.hp, 0, 'ออกแล้ว', 22, '#ff8a80').setOrigin(0.5);
        row.add([rg, portrait, name, bar, dmg, label(this, COL.acc, 0, `${acc}%`, 26).setOrigin(0.5), hp]);
        if (mvp) {
          const tag = this.add.container(COL.name + name.displayWidth + 44, 0);
          const tg = this.add.graphics();
          drawPlate(tg, 70, 30, THEME.gold, { cut: 8 });
          tag.add([tg, label(this, 0, 0, 'MVP', 18, '#2a1a00').setStroke('#ffe08a', 2).setOrigin(0.5)]);
          row.add(tag);
        }
        c.add(row);
        row.setAlpha(0).setX(80);
        const delay = 450 + i * 110;
        this.tweens.add({ targets: row, x: 0, alpha: 1, duration: 260, delay, ease: 'Cubic.easeOut' });
        const full = top > 0 ? (s.damage / top) * 216 : 0;
        this.tweens.addCounter({
          from: 0, to: 1, duration: 700, delay: delay + 150, ease: 'Cubic.easeOut',
          onUpdate: (tw) => {
            const k = tw.getValue() ?? 0;
            bar.width = Math.max(1, full * k);
            dmg.setText(`${Math.round(s.damage * k)}`);
          },
        });
      });

      // ranked: the new rating arrives a moment after the result
      const rating = label(this, 0, 188, 'กำลังคิดคะแนน…', 30, '#ffd166').setOrigin(0.5);
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

      const buttons = b.net && net.room?.ranked
        ? [new Button(this, 0, 272, 420, 92, 'กลับเมนู', {
          fill: THEME.green, size: 36, onClick: () => {
            net.leave();
            b.scene.start('menu');
          },
        })]
        : b.net
        ? [new Button(this, 0, 272, 420, 92, 'กลับห้อง', { fill: THEME.green, size: 36, onClick: () => b.scene.start('lobby') })]
        : [
          new Button(this, -200, 272, 360, 92, 'เล่นอีกครั้ง', { fill: THEME.green, size: 36, onClick: () => b.scene.restart() }),
          new Button(this, 200, 272, 360, 92, 'เปลี่ยนตัว/ด่าน', { size: 32, onClick: () => b.scene.start('setup') }),
        ];
      c.add([rating, ...buttons, ribbon]);
      for (const btn of buttons) {
        btn.setAlpha(0);
        this.tweens.add({ targets: btn, alpha: 1, duration: 250, delay: 600 + stats.length * 110 });
      }
      c.setScale(0.85).setAlpha(0);
      this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    });
  }

  // ---------------------------------------------------------------- per frame

  update(time: number): void {
    const b = this.battle;
    if (!b.turns) return;
    const g = this.g;
    g.clear();
    const active = b.active;
    const human = b.isLocal(active);
    this.t.net.setText(b.net && !net.connected ? 'หลุดการเชื่อมต่อ กำลังต่อใหม่…' : b.phase === 'wait' && b.isLocal(active) ? 'รอเซิร์ฟเวอร์…' : '');
    if (this.aimHold.dir && time - this.aimHold.since > AIM_HOLD_MS) b.touch.aim = this.aimHold.dir;

    this.updatePanels(time);

    // turn, countdown, wind, last shot
    const sd = b.turns.suddenDeath ? ' · Sudden death' : '';
    const [, , tw, th] = box([0, 0, 335, 44]);
    fit(this.t.turn.setScale(1).setText(`เทิร์น ${b.turns.turnNumber} — ${human ? 'ตาของคุณ' : `ตาของ${active.name}`}${sd}`), tw, th * 1.15);
    const left = Math.max(0, Math.ceil(b.turns.timeLeft));
    this.t.timer.setText(b.phase === 'aim' ? `${left}` : '–').setColor(b.phase === 'aim' && left <= 5 ? '#ff6b6b' : '#ffffff');
    this.drawWind(time);
    this.drawLastShot();

    this.drawAngle(g);
    this.drawPower(g, active.id);
    this.updateSlots(human);
    this.fire.setEnabled(human && (b.humanCanAct || b.charging) && b.phase !== 'over');
    this.drawOffscreenArrows(g);
  }

  /** HP fill cropped to what is left, the numbers, queue tags; the active character's portrait breathes. */
  private updatePanels(time: number): void {
    const b = this.battle;
    const order = b.turns.order();
    const active = b.active;
    const waiting = order.filter((t) => t !== active);
    const base = waiting.length ? Math.min(...waiting.map((t) => t.delay)) : 0;
    for (const p of this.panels) {
      const t = p.tank;
      const k = Phaser.Math.Clamp(t.hp / t.maxHp, 0, 1);
      const fw = p.fill.width * k;
      // the bar drains toward the portrait's side
      p.fill.setCrop(p.right ? p.fill.width - fw : 0, 0, fw, p.fill.height).setVisible(t.alive && fw > 0);
      p.hp.setText(t.alive ? `${t.hp} / ${t.maxHp}` : 'ออกแล้ว');
      const pos = waiting.indexOf(t);
      const queue = !t.alive || b.phase === 'over' ? '' : t === active ? 'ตานี้' : pos === 0 ? 'ตาถัดไป' : `คิว ${pos + 1} (ดีเลย์ +${t.delay - base})`;
      p.tags.setText([queue, t.armored ? 'เกราะ' : '', t.burrowed ? 'มุดดิน' : ''].filter(Boolean).join(' · '));
      p.portrait.setAlpha(t.alive ? 1 : 0.4);
      const live = t === active && b.phase !== 'over';
      const pulse = live ? 1 + 0.04 * Math.sin(time / 160) : 1;
      p.avatar.setScale(p.avatarScale[0] * pulse, p.avatarScale[1] * pulse);
    }
  }

  /** Strength in the right half of the panel; the chevrons on the left point and drift the way it blows. */
  private drawWind(time: number): void {
    const b = this.battle;
    const calm = b.mods.noWind && b.phase !== 'settle' && b.phase !== 'over';
    const wind = calm ? 0 : b.world.wind;
    this.t.wind.setText(`${Math.abs(wind)}`);
    this.t.windTag.setText(calm ? 'ไร้ลม' : 'ลม');
    const a = this.img.windArrows;
    const [bx, , bw] = box([636, 0, 65, 0]);
    const dir = Math.sign(wind);
    a.setVisible(dir !== 0).setFlipX(dir > 0);
    a.setX(bx + bw / 2 + dir * ((time / 60) % 10 - 5)).setAlpha(0.65 + 0.35 * Math.abs(Math.sin(time / 300)));
  }

  /** "Last shot: …" on its strip, the number at the end in yellow; a crown on a hit. */
  private drawLastShot(): void {
    const text = this.battle.lastShotText;
    const show = !!text;
    for (const o of [this.img.shotStrip, this.t.shot, this.t.damage]) o.setVisible(show);
    this.img.crown.setVisible(show && text.startsWith('โดน'));
    if (!show) return;
    const m = /^(.*?)\s*(\d+(?:px)?)$/.exec(text);
    const head = `นัดล่าสุด: ${m ? m[1] : text}`;
    this.t.shot.setScale(1).setText(head);
    this.t.damage.setScale(1).setText(m ? m[2] : '');
    const [x0, , w] = box([701, 0, 330, 0]);
    const gap = m ? 8 : 0;
    const total = this.t.shot.width + gap + this.t.damage.width;
    const k = Math.min(1, w / total);
    this.t.shot.setScale(k);
    this.t.damage.setScale(k);
    const start = x0 + (w - total * k) / 2;
    this.t.shot.setX(start);
    this.t.damage.setX(start + (this.t.shot.width + gap) * k);
  }

  /** The painted dial turned toward the facing side, its needle at the aim, last turn's angle in red. */
  private drawAngle(g: Phaser.GameObjects.Graphics): void {
    const t = this.battle.active;
    const f = t.facing;
    this.img.gauge.setFlipX(f < 0);
    const rad = (deg: number) => (f > 0 ? -deg : 180 + deg) * (Math.PI / 180);
    this.img.needle.setRotation(rad(t.angle)).setFlipY(f < 0);
    const [cx, cy] = box([DIAL.x, DIAL.y, 0, 0]);
    const r = DIAL.r * K;
    const last = this.battle.lastAngle.get(t.id);
    if (last !== undefined) {
      const a = rad(last);
      g.lineStyle(5, 0xff3858, 1);
      g.lineBetween(cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18), cx + Math.cos(a) * (r + 2), cy + Math.sin(a) * (r + 2));
    }
    this.t.angle.setText(`${Math.round(t.angle)}°`);
  }

  /** Gold fill and the white handle at the charge; the red marker at last turn's power; fuel as a thin line under the rail. */
  private drawPower(g: Phaser.GameObjects.Graphics, activeId: number): void {
    const b = this.battle;
    const fill = this.img.powerFill;
    const k = Phaser.Math.Clamp(b.power / 100, 0, 1);
    fill.setCrop(0, 0, fill.width * k, fill.height).setVisible(k > 0);
    const xAt = (p: number) => (POWER.x0 + ((POWER.x1 - POWER.x0) * p) / 100) * K;
    this.img.handle.setX(xAt(b.power));
    const last = b.lastPower.get(activeId);
    this.img.max.setVisible(last !== undefined);
    if (last !== undefined) this.img.max.setX(xAt(last));
    const fuel = Phaser.Math.Clamp(b.turns.fuel / (TUNING.fuelPerTurn * b.active.move), 0, 1);
    const y = (POWER.y + POWER.h + 14) * K;
    g.fillStyle(0x0a0f22, 0.9);
    g.fillRoundedRect(xAt(0), y, xAt(100) - xAt(0), 7, 3);
    if (fuel > 0) {
      g.fillStyle(0x5fd4ff, 1);
      g.fillRoundedRect(xAt(0), y, (xAt(100) - xAt(0)) * fuel, 7, 3);
    }
  }

  /**
   * Weapon, drill, three items and the skill for whoever plays from this screen: the active
   * character on your turn, else your own (greyed while someone else plays). Empty slots get
   * the padlock.
   */
  private updateSlots(human: boolean): void {
    const b = this.battle;
    const t = human ? b.active : b.world.tanks.find((o) => b.isLocal(o) && o.alive) ?? b.active;
    const can = human && b.humanCanAct;
    const main = WEAPONS[t.loadout.weapon];
    const skillId = skillOf(t);
    const cd = t.skillCooldown;
    const rows: { icon: string | null; text: string; on: boolean; ok: boolean }[] = [
      { icon: this.gunIcon(main.id), text: `1 ${SLOT_NAME[main.id]}`, on: human && !b.useDrill, ok: true },
      { icon: this.gunIcon('drill'), text: `2 สว่าน x${t.drillLeft}`, on: human && b.useDrill, ok: t.drillLeft > 0 },
      ...[0, 1, 2].map((i) => {
        const item = t.items[i];
        return { icon: item ? iconTexture(this, item) : null, text: `${i + 3} ${item ? ITEMS[item].name : '—'}`, on: false, ok: !!item && !b.mods.itemUsed };
      }),
      {
        icon: skillId ? iconTexture(this, skillId) : null,
        text: !skillId ? 'E —' : cd > 0 ? `E รอ ${cd} ตา` : `E ${SKILLS[skillId].name}`,
        on: false, ok: !!skillId && cd === 0 && !b.mods.skillUsed,
      },
    ];
    rows.forEach((r, i) => {
      const s = this.slots[i];
      const w = s.btn.w;
      const h = s.btn.h;
      if (r.icon) {
        refit(s.icon, r.icon, w * 0.47, h * 0.57);
        s.icon.setPosition(-w / 2 + w * 0.325, -h / 2 + h * 0.405);
        s.caption.setX(-w / 2 + w * 0.625);
      } else {
        refit(s.icon, U('lock'), w * 0.22, h * 0.34);
        s.icon.setPosition(0, -h / 2 + h * 0.34);
        s.caption.setX(0);
      }
      if (s.caption.text !== r.text) fit(s.caption.setScale(1).setText(r.text), w * (r.icon ? 0.62 : 0.6), h * 0.36);
      s.pick.setVisible(r.on);
      s.btn.setEnabled(can && r.ok);
      // your loadout stays readable while someone else plays
      if (!can && r.icon) s.btn.setAlpha(human ? 0.55 : 0.8);
    });
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
