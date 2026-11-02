import Phaser from 'phaser';
import { ART_SCALE, Pose, gunLook, hasArt, poseTexture, shellKey } from '../art/chibi';
import { Rng, createRng } from '../core/rng';
import { TurnManager } from '../core/TurnManager';
import { BotAction, ShotPlanner, Shot, chooseAttackItem, chooseSupport } from '../core/BotAI';
import { TurnMods, freshMods, useItem, useSkill } from '../core/Actions';
import { CHARACTERS, CHARACTER_IDS, ITEMS, ITEMS_PER_MATCH, ITEM_IDS, ItemId, SKILLS, WEAPONS, WeaponDef } from '../core/data';
import { MAP_H, MAP_W, MapId, generateMap, spawnX } from '../core/Maps';
import { Volley, fireVolley, stepVolley, volleyDone } from '../core/Shot';
import { TUNING, Tank, World, createTank, createWorld, explode, isSettled, muzzle, stepTank, tankCentre, walk } from '../core/World';
import { FONT, TEAM_COLORS } from '../ui/widgets';
import { isMuted, setCharge, setMuted, sfx, stopCharge } from '../audio/sfx';
import { MatchSetup, loadSetup } from './setup';

export type Phase = 'aim' | 'botThink' | 'botWalk' | 'botAim' | 'flying' | 'settle' | 'over';

/** Written by the HUD's touch buttons, merged with the keyboard every tick. */
export interface TouchInput {
  move: number;
  aim: number;
  fire: boolean;
}

export interface TankStats {
  damage: number;
  shots: number;
  hits: number;
}

interface TankView {
  body: Phaser.GameObjects.Image;
  gun: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  flashMs: number;
  hurtMs: number;
  shootMs: number;
  walkT: number;
}

// `tint` multiplies the generated dirt texture; the flat colours are the fallback when it is missing.
const THEMES: Record<MapId, { bg: [number, number]; top: number[] | null; dirt: number[]; deep: number[]; clouds: boolean; tint: number[] }> = {
  hills: { bg: [0x7cc6f2, 0xd7f0ff], top: [98, 178, 72], dirt: [150, 100, 62], deep: [90, 60, 37], clouds: true, tint: [1, 1, 1] },
  islands: { bg: [0x9bd3ff, 0xf5e6ff], top: [120, 196, 92], dirt: [168, 128, 96], deep: [112, 92, 120], clouds: true, tint: [1.02, 0.96, 1.04] },
  mine: { bg: [0x2a211d, 0x4a3b33], top: null, dirt: [128, 104, 88], deep: [70, 58, 52], clouds: false, tint: [0.78, 0.7, 0.86] },
};

const SAMPLES = { easy: 120, normal: 220, hard: 320 };

export default class BattleScene extends Phaser.Scene {
  setup!: MatchSetup;
  world!: World;
  turns!: TurnManager;
  phase: Phase = 'aim';
  power = 0;
  charging = false;
  mods: TurnMods = freshMods();
  useDrill = false;
  lastPower = new Map<number, number>();
  lastAngle = new Map<number, number>();
  lastShotText = '';
  stats = new Map<number, TankStats>();
  winner: number | null = null;
  touch: TouchInput = { move: 0, aim: 0, fire: false };
  /** Pointer ids currently pressing HUD buttons; they never pan the camera. */
  uiPointers = new Set<number>();

  private rng!: Rng;
  private acc = 0;
  private hitStopMs = 0;
  private slowMoMs = 0;

  // shot in flight
  private volley: Volley | null = null;
  private shotWeapon: WeaponDef = WEAPONS.cannon;
  private shotsLeft = 0;
  private refireTimer = 0;
  private trail: { x: number; y: number }[] = [];
  private lastTrail = new Map<number, { x: number; y: number }[]>();
  private volleyHits: { x: number; y: number }[] = [];
  private volleyDamage = 0;
  private settleTime = 0;
  private camProxy = { x: 0, y: 0 };

  // bot
  private planner: ShotPlanner | null = null;
  private botShot: Shot | null = null;
  private botTimer = 0;
  private missStreak = new Map<number, number>();
  private botSupportDone = false;
  private botWalked = false;
  private botWalkDir: 1 | -1 = 1;
  private botWalkLeft = 0;

  // camera
  private manualCam = false;
  private camTarget = { x: 0, y: 0 };

  // rendering
  private terrainTex!: Phaser.Textures.CanvasTexture;
  private dirtPattern: CanvasPattern | null = null;
  private views = new Map<number, TankView>();
  private shellImgs: Phaser.GameObjects.Image[] = [];
  private overlay!: Phaser.GameObjects.Graphics;
  private fxGfx!: Phaser.GameObjects.Graphics;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private aimLabel!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('battle');
  }

  init(): void {
    // Reset per-run state here (the scene instance is reused on restart).
    this.setup = loadSetup(this.registry);
    this.phase = 'aim';
    this.acc = 0;
    this.hitStopMs = 0;
    this.slowMoMs = 0;
    this.power = 0;
    this.charging = false;
    this.mods = freshMods();
    this.useDrill = false;
    this.volley = null;
    this.shotsLeft = 0;
    this.refireTimer = 0;
    this.trail = [];
    this.lastTrail = new Map();
    this.lastPower = new Map();
    this.lastAngle = new Map();
    this.missStreak = new Map();
    this.stats = new Map();
    this.views = new Map();
    this.shellImgs = [];
    this.winner = null;
    this.lastShotText = '';
    this.manualCam = false;
    this.planner = null;
    this.touch = { move: 0, aim: 0, fire: false };
    this.uiPointers = new Set();
  }

  create(): void {
    this.rng = createRng((Date.now() ^ 0x5bd1e995) >>> 0);
    const terrain = generateMap(this.setup.map, this.rng);
    this.world = createWorld(terrain, this.buildTeams(terrain));
    for (const t of this.world.tanks) this.stats.set(t.id, { damage: 0, shots: 0, hits: 0 });
    this.turns = new TurnManager(this.world, this.rng);

    this.paintBackground();
    this.paintTerrain();
    this.fxGfx = this.add.graphics().setDepth(5);
    this.overlay = this.add.graphics().setDepth(12);
    this.aimGfx = this.add.graphics().setDepth(9); // behind the character, above the ground
    this.aimLabel = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '28px', color: '#ffd166', stroke: '#1b2030', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(13);
    for (const t of this.world.tanks) this.views.set(t.id, this.makeView(t));
    this.createInput();

    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
    this.scene.launch('hud');
    this.scene.bringToTop('hud');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      stopCharge();
      this.scene.stop('hud');
    });
    this.startTurn();
  }

  private buildTeams(terrain: World['terrain']): Tank[] {
    const { format, char, items } = this.setup;
    const botChar = () => CHARACTER_IDS[Math.floor(this.rng() * CHARACTER_IDS.length)];
    const botItems = (): ItemId[] => {
      const pool = [...ITEM_IDS];
      return Array.from({ length: ITEMS_PER_MATCH }, () => pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
    };
    const tanks: Tank[] = [createTank(0, 'คุณ', 0, false, spawnX(this.setup.map, 0, 0), terrain, char, items)];
    if (format === '2v2') tanks.push(createTank(tanks.length, 'เพื่อนบอท', 0, true, spawnX(this.setup.map, 0, 1), terrain, botChar(), botItems()));
    const enemies = format === '1v1' ? 1 : 2;
    for (let i = 0; i < enemies; i++) {
      tanks.push(createTank(tanks.length, enemies > 1 ? `บอท ${i + 1}` : 'บอท', 1, true, spawnX(this.setup.map, 1, i), terrain, botChar(), botItems()));
    }
    return tanks;
  }

  // ---------------------------------------------------------------- terrain & backdrop

  private paintBackground(): void {
    const theme = THEMES[this.setup.map];
    const art = `art-bg-${this.setup.map}`;
    if (hasArt(this, art)) {
      // Painted backdrop with a little parallax; sized so it covers the view at any scroll.
      const f = 0.35;
      const img = this.add.image(0, 0, art).setOrigin(0, 0).setScrollFactor(f).setDepth(0);
      img.setScale(Math.max(MAP_H / img.height, (1920 + (MAP_W - 1920) * f) / img.width));
      return;
    }
    const g = this.add.graphics().setDepth(0).setScrollFactor(0.2);
    g.fillGradientStyle(theme.bg[0], theme.bg[0], theme.bg[1], theme.bg[1], 1);
    g.fillRect(-200, -200, MAP_W, MAP_H + 400);
    if (theme.clouds) {
      g.fillStyle(0xffffff, 0.8);
      for (let i = 0; i < 9; i++) {
        const x = 120 + i * 260 + Math.sin(i * 7) * 80;
        const y = 80 + (i % 3) * 90;
        g.fillEllipse(x, y, 200, 60);
        g.fillEllipse(x + 50, y - 22, 120, 70);
      }
      const hills = this.add.graphics().setDepth(0).setScrollFactor(0.5);
      hills.fillStyle(0xa8d8a0, 0.7);
      hills.beginPath();
      hills.moveTo(0, MAP_H);
      for (let x = 0; x <= MAP_W; x += 40) hills.lineTo(x, 640 + Math.sin(x / 260) * 70 + Math.sin(x / 97) * 20);
      hills.lineTo(MAP_W, MAP_H);
      hills.closePath();
      hills.fillPath();
    } else {
      g.fillStyle(0x9be7ff, 0.25);
      for (let i = 0; i < 40; i++) g.fillCircle((i * 197) % MAP_W, 120 + ((i * 331) % 800), 3 + (i % 3));
    }
  }

  private paintTerrain(): void {
    const theme = THEMES[this.setup.map];
    if (this.textures.exists('terrain')) this.textures.remove('terrain');
    this.terrainTex = this.textures.createCanvas('terrain', MAP_W, MAP_H)!;
    const ctx = this.terrainTex.getContext();
    const dirtArt = hasArt(this, 'art-dirt') ? (this.textures.get('art-dirt').getSourceImage() as HTMLImageElement) : null;
    if (dirtArt) {
      this.dirtPattern = ctx.createPattern(dirtArt, 'repeat');
      ctx.fillStyle = this.dirtPattern!;
      ctx.fillRect(0, 0, MAP_W, MAP_H);
    }
    const img = dirtArt ? ctx.getImageData(0, 0, MAP_W, MAP_H) : ctx.createImageData(MAP_W, MAP_H);
    const d = img.data;
    const { terrain } = this.world;
    const surfaces: { x: number; y: number }[] = [];
    for (let x = 0; x < MAP_W; x++) {
      let depth = 0;
      let air = 0; // air run above the current dirt; small pockets don't count as a new surface
      let exposed = false; // this dirt run has open air above it (false for a cave ceiling)
      for (let y = 0; y < MAP_H; y++) {
        const i = (y * MAP_W + x) * 4;
        if (!terrain.mask[y * MAP_W + x]) {
          air++;
          d[i + 3] = 0;
          continue;
        }
        if (air > 40) {
          depth = 0; // a real surface (sky or cave floor), not a tunnel
          exposed = true;
          surfaces.push({ x, y });
        }
        air = 0;
        const surface = exposed && depth < 7;
        const k = Math.min(1, depth / 420);
        if (dirtArt) {
          // texture, darkened with depth and tinted per map; a light lip on bare (grassless) surfaces
          const f = (1 - 0.5 * k) * (!theme.top && surface && depth < 4 ? 1.35 : 1);
          for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, d[i + c] * f * theme.tint[c]);
          d[i + 3] = 255;
        } else {
          const n = ((x * 73856093) ^ (y * 19349663)) & 15; // cheap per-pixel grain
          let c: number[];
          if (theme.top && surface) c = [theme.top[0] + n, theme.top[1] + n, theme.top[2]];
          else if (!theme.top && surface && depth < 4) c = [175 + n, 160 + n, 140];
          else c = theme.dirt.map((v, j) => v + (theme.deep[j] - v) * k + (j < 2 ? n : 0));
          d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
        }
        depth++;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.paintBackWall(this.terrainTex.getCanvas());
    // Grass strip along every open-air surface (not in the cave).
    if (theme.top && hasArt(this, 'art-grass')) {
      const grass = this.textures.get('art-grass').getSourceImage() as HTMLImageElement;
      for (const { x, y } of surfaces) ctx.drawImage(grass, x % grass.width, 0, 1, grass.height, x, y - 14, 1, grass.height);
    }
    this.terrainTex.refresh();
    this.add.image(0, 0, 'terrain').setOrigin(0, 0).setDepth(1);
  }

  /**
   * A darkened copy of the starting ground, drawn behind the terrain and never carved,
   * so craters and tunnels read as dug-out earth instead of showing the sky backdrop.
   */
  private paintBackWall(source: HTMLCanvasElement): void {
    if (this.textures.exists('terrain-back')) this.textures.remove('terrain-back');
    const back = this.textures.createCanvas('terrain-back', MAP_W, MAP_H)!;
    const ctx = back.getContext();
    ctx.drawImage(source, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(30, 16, 10, 0.62)';
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    back.refresh();
    this.add.image(0, 0, 'terrain-back').setOrigin(0, 0).setDepth(0.5);
  }

  /** Mirror terrain edits (craters, drill tunnels, walls) onto the canvas. */
  private drainTerrainChanges(): void {
    const changes = this.world.terrain.changes;
    if (changes.length === 0) return;
    const ctx = this.terrainTex.getContext();
    const theme = THEMES[this.setup.map];
    for (const ch of changes) {
      ctx.save();
      if (ch.kind === 'carve') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(ch.x, ch.y, ch.r, 0, Math.PI * 2);
        ctx.fill();
        // scorched rim, only drawn where dirt remains
        ctx.globalCompositeOperation = 'source-atop';
        ctx.strokeStyle = 'rgba(45, 25, 14, 0.8)';
        ctx.lineWidth = ch.r > 20 ? 7 : 4;
        ctx.beginPath();
        ctx.arc(ch.x, ch.y, ch.r + 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const [r, g, b] = theme.dirt;
        ctx.fillStyle = this.dirtPattern ?? `rgb(${r + 15}, ${g + 10}, ${b + 5})`;
        ctx.fillRect(ch.x, ch.y, ch.w, ch.h);
        if (this.dirtPattern) {
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = `rgb(${theme.tint.map((t) => Math.round(Math.min(1, t) * 255)).join(',')})`;
          ctx.fillRect(ch.x, ch.y, ch.w, ch.h);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.strokeStyle = 'rgba(60, 40, 25, 0.9)';
        ctx.lineWidth = 3;
        for (let y = ch.y + 14; y < ch.y + ch.h - 30; y += 16) {
          ctx.beginPath();
          ctx.moveTo(ch.x, y);
          ctx.lineTo(ch.x + ch.w, y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    changes.length = 0;
    this.terrainTex.refresh();
  }

  // ---------------------------------------------------------------- input

  private createInput(): void {
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    const names = ['LEFT', 'RIGHT', 'UP', 'DOWN', 'A', 'D', 'W', 'S', 'SHIFT', 'SPACE', 'C', 'R', 'E', 'M', 'ESC', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'] as const;
    this.keys = Object.fromEntries(names.map((n) => [n, kb.addKey(K[n])]));
    this.keys.ONE.on('down', () => this.selectWeapon(false));
    this.keys.TWO.on('down', () => this.selectWeapon(true));
    this.keys.THREE.on('down', () => this.useItemSlot(0));
    this.keys.FOUR.on('down', () => this.useItemSlot(1));
    this.keys.FIVE.on('down', () => this.useItemSlot(2));
    this.keys.E.on('down', () => this.useSkillNow());
    this.keys.C.on('down', () => this.recenter());
    this.keys.R.on('down', () => this.scene.restart());
    this.keys.ESC.on('down', () => this.toMenu());
    this.keys.M.on('down', () => setMuted(!isMuted()));

    // Pan the map: right-drag with a mouse, two-finger drag on a tablet.
    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const cam = this.cameras.main;
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      let dx = 0;
      let dy = 0;
      if (p.rightButtonDown()) {
        dx = p.x - p.prevPosition.x;
        dy = p.y - p.prevPosition.y;
      } else if (p1.isDown && p2.isDown && !this.uiPointers.has(p1.id) && !this.uiPointers.has(p2.id)) {
        dx = (p.x - p.prevPosition.x) / 2;
        dy = (p.y - p.prevPosition.y) / 2;
      } else return;
      this.manualCam = true;
      cam.stopFollow();
      cam.scrollX -= dx / cam.zoom;
      cam.scrollY -= dy / cam.zoom;
    });
  }

  // ---------------------------------------------------------------- commands (keyboard + HUD)

  get active(): Tank {
    return this.turns.active;
  }

  /** True while the human may walk, aim, pick weapons and use items. */
  get humanCanAct(): boolean {
    return this.phase === 'aim' && !this.active.isBot && !this.charging;
  }

  get mainWeapon(): WeaponDef {
    return WEAPONS[CHARACTERS[this.active.char].weapon];
  }

  selectWeapon(drill: boolean): void {
    if (!this.humanCanAct) return;
    this.useDrill = drill && this.active.drillLeft > 0;
  }

  useItemSlot(slot: number): void {
    if (!this.humanCanAct) return;
    this.applyItem(this.active, slot);
  }

  useSkillNow(): void {
    if (!this.humanCanAct) return;
    this.applySkill(this.active);
  }

  nudgeAngle(deg: number): void {
    if (!this.humanCanAct) return;
    this.active.angle = Phaser.Math.Clamp(Math.round(this.active.angle) + deg, 0, 90);
  }

  recenter(): void {
    this.manualCam = false;
    const c = tankCentre(this.active);
    this.focusOn(c.x, c.y, 300);
  }

  toMenu(): void {
    this.scene.start('menu');
  }

  private applyItem(t: Tank, slot: number): ItemId | null {
    const item = useItem(t, slot, this.mods);
    if (!item) return null;
    const c = tankCentre(t);
    sfx.powerUp();
    this.floatText(c.x, c.y - 70, ITEMS[item].name, '#8ef0ff');
    if (item === 'heal') this.floatText(c.x, c.y - 30, '+250', '#7CFC9A');
    return item;
  }

  private applySkill(t: Tank): boolean {
    const res = useSkill(this.world, t, this.mods);
    if (!res) return false;
    this.events.emit('banner', `${t.name}: ${SKILLS[res.skill].name}!`, TEAM_COLORS[t.team]);
    if (res.wall) sfx.thud();
    else sfx.powerUp();
    if (res.wall) this.dust(res.wall.x + res.wall.w / 2, res.wall.y + res.wall.h - 40);
    if (res.endsTurn) {
      this.dust(t.x, t.y);
      this.lastShotText = '';
      this.beginSettle();
    }
    return true;
  }

  // ---------------------------------------------------------------- turn flow

  private startTurn(): void {
    const t = this.turns.next();
    this.mods = freshMods();
    this.useDrill = false;
    this.power = 0;
    this.charging = false;
    this.manualCam = false;
    this.focusOn(tankCentre(t).x, tankCentre(t).y, 600);
    const mine = t.team === 0;
    this.events.emit('banner', t.isBot ? (mine ? 'ตาของเพื่อนบอท' : `ตาของ${t.name}`) : 'ตาของคุณ', TEAM_COLORS[t.team]);
    if (this.turns.turnNumber === TUNING.suddenDeathTurn + 1) {
      this.time.delayedCall(900, () => this.events.emit('banner', 'Sudden death! น้ำกำลังขึ้น', 0x8ecae6));
    }
    if (t.isBot) {
      this.phase = 'botThink';
      this.botTimer = 0.8;
      this.planner = null;
      this.botShot = null;
      this.botSupportDone = false;
      this.botWalked = false;
    } else {
      this.phase = 'aim';
      sfx.turn();
    }
  }

  private endTurn(): void {
    const w = this.turns.winner();
    if (w !== null) {
      this.phase = 'over';
      this.winner = w;
      this.events.emit('over', w);
      this.time.delayedCall(700, () => (w === 0 ? sfx.win() : sfx.lose()));
      return;
    }
    this.startTurn();
  }

  private fire(t: Tank): void {
    t.angle = Math.round(t.angle);
    this.power = Math.round(this.power);
    this.lastPower.set(t.id, this.power);
    this.lastAngle.set(t.id, t.angle);
    this.shotWeapon = this.useDrill ? WEAPONS.drill : WEAPONS[CHARACTERS[t.char].weapon];
    if (this.useDrill) t.drillLeft--;
    this.shotsLeft = this.mods.shots;
    this.volleyHits = [];
    this.volleyDamage = 0;
    this.charging = false;
    this.stats.get(t.id)!.shots++;
    this.launchVolley(t);
  }

  private launchVolley(t: Tank): void {
    this.shotsLeft--;
    this.volley = fireVolley(t, this.shotWeapon, this.power, this.mods.noWind);
    sfx.fire(this.shotWeapon.id === 'hammer');
    this.trail = [];
    this.phase = 'flying';
    this.manualCam = false;
    const s = this.volley.shells[0];
    this.camProxy.x = s.x;
    this.camProxy.y = s.y;
    this.cameras.main.startFollow(this.camProxy, false, 0.12, 0.12);
    this.recoil(t);
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number): void {
    if (this.hitStopMs > 0) {
      this.hitStopMs -= delta; // freeze-frame on big hits (real time)
    } else {
      let step = Math.min(delta, 250) / 1000; // clamp spikes so a stall can't launch everything
      if (this.slowMoMs > 0) {
        this.slowMoMs -= delta;
        step *= 0.3; // KO slow motion
      }
      this.acc += step;
      while (this.acc >= TUNING.dt) {
        this.fixedTick();
        this.acc -= TUNING.dt;
      }
    }
    this.drainTerrainChanges();
    this.drawWorld(delta);
    if ((this.phase === 'aim' && this.charging) || (this.phase === 'botAim' && this.power > 0)) setCharge(this.power);
    else stopCharge();
  }

  private fixedTick(): void {
    const dt = TUNING.dt;
    const active = this.active;

    switch (this.phase) {
      case 'aim':
        this.tickHumanAim(active, dt);
        this.tickTanks();
        break;

      case 'botThink':
        this.tickTanks();
        this.tickBotThink(active, dt);
        break;

      case 'botWalk': {
        // No shot reached anyone: shuffle toward the nearest enemy, then think again.
        const moved = walk(this.world, active, this.botWalkDir);
        this.turns.fuel = Math.max(0, this.turns.fuel - moved);
        this.botWalkLeft -= moved;
        this.tickTanks();
        if (moved === 0 || this.botWalkLeft <= 0 || this.turns.fuel <= 0) {
          this.phase = 'botThink';
          this.botTimer = 0.3;
        }
        break;
      }

      case 'botAim': {
        // Turn the barrel and charge like a human would, so the player can read the shot.
        const shot = this.botShot!;
        const da = shot.angle - active.angle;
        active.angle += Math.sign(da) * Math.min(Math.abs(da), 40 * dt);
        if (Math.abs(da) < 0.01) {
          this.power = Math.min(shot.power, this.power + (100 / TUNING.chargeSeconds) * dt);
          if (this.power >= shot.power) this.fire(active);
        }
        break;
      }

      case 'flying':
        this.tickFlying(active, dt);
        this.tickTanks();
        break;

      case 'settle':
        this.settleTime += dt;
        this.tickTanks();
        if (this.settleTime > 0.7 && isSettled(this.world)) this.endTurn();
        else if (this.settleTime > 6) this.endTurn(); // safety net
        break;

      case 'over':
        this.tickTanks();
        break;
    }
  }

  private tickHumanAim(t: Tank, dt: number): void {
    const k = this.keys;
    this.turns.timeLeft -= dt;
    if (this.turns.timeLeft <= 0) {
      if (this.charging) this.fire(t);
      else {
        this.lastShotText = 'หมดเวลา';
        this.beginSettle();
      }
      return;
    }
    if (!this.charging) {
      const kbMove = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
      const dir = kbMove || this.touch.move;
      if (dir !== 0 && this.turns.fuel > 0) {
        this.turns.fuel = Math.max(0, this.turns.fuel - walk(this.world, t, dir > 0 ? 1 : -1));
        this.manualCam = false;
      }
      const speed = k.SHIFT.isDown ? 6 : 30; // deg/s
      const aim = (k.UP.isDown || k.W.isDown ? 1 : 0) - (k.DOWN.isDown || k.S.isDown ? 1 : 0) || this.touch.aim;
      t.angle = Phaser.Math.Clamp(t.angle + aim * speed * dt, 0, 90);
    }
    if (k.SPACE.isDown || this.touch.fire) {
      this.charging = true;
      this.power = Math.min(100, this.power + (100 / TUNING.chargeSeconds) * dt);
    } else if (this.charging) {
      this.fire(t);
    }
  }

  private tickBotThink(bot: Tank, dt: number): void {
    this.botTimer -= dt;
    if (this.botTimer > 0 || !isSettled(this.world)) return;
    const difficulty = this.setup.difficulty;
    if (!this.planner) {
      if (!this.botSupportDone) {
        this.botSupportDone = true;
        for (const a of chooseSupport(this.world, bot, CHARACTERS[bot.char].skill, difficulty)) {
          this.applyBotAction(bot, a);
          if (this.phase !== 'botThink') return; // burrow ended the turn
        }
      }
      const opts = { weapon: this.mainWeapon, noWind: this.mods.noWind, dmgScale: this.mods.dmgScale };
      this.planner = new ShotPlanner(this.world, bot, this.rng, opts, SAMPLES[difficulty]);
    }
    // Spread the search over frames so the game never hitches.
    if (!this.planner.work(30)) return;
    if (this.planner.bestScore < 1000 && !this.botWalked && this.turns.fuel > 30) {
      // Nothing damaging from here (hill in the way, headwind): walk once and replan.
      const bc = tankCentre(bot);
      const nearest = this.world.tanks
        .filter((t) => t.alive && t.team !== bot.team)
        .sort((a, b) => Math.abs(a.x - bc.x) - Math.abs(b.x - bc.x))[0];
      this.botWalked = true;
      this.botWalkDir = nearest && nearest.x < bot.x ? -1 : 1;
      this.botWalkLeft = 120;
      this.planner = null;
      this.phase = 'botWalk';
      return;
    }
    if (!this.mods.itemUsed) {
      const a = chooseAttackItem(bot, this.planner.bestScore > 1000, difficulty);
      if (a) this.applyBotAction(bot, a);
    }
    this.botShot = this.planner.result(difficulty, this.missStreak.get(bot.id) ?? 0);
    bot.facing = this.botShot.facing;
    this.phase = 'botAim';
  }

  private applyBotAction(bot: Tank, a: BotAction): void {
    if (a.kind === 'item') this.applyItem(bot, a.slot);
    else this.applySkill(bot);
  }

  private tickFlying(shooter: Tank, dt: number): void {
    if (!this.volley) {
      // gap between the two shots of "double"
      this.refireTimer -= dt;
      if (this.refireTimer <= 0) this.launchVolley(shooter);
      return;
    }
    const v = this.volley;
    for (const ev of stepVolley(this.world, v)) {
      if (ev.kind === 'impact') this.onImpact(shooter, ev.x, ev.y, ev.hitTank);
      else if (ev.kind === 'carve') {
        this.world.terrain.carve(ev.x, ev.y, ev.r);
        sfx.drill();
        if (Math.random() < 0.3) this.debris(ev.x, ev.y, 2); // cosmetic only, not the match rng
      } else if (ev.kind === 'split') {
        this.flash(ev.x, ev.y, 18, 0xffd166);
        sfx.split();
      }
    }
    const lead = v.shells.find((s) => !s.done);
    if (lead) {
      this.trail.push({ x: lead.x, y: lead.y });
      this.camProxy.x = lead.x;
      this.camProxy.y = lead.y;
    }
    if (!volleyDone(v)) return;

    this.lastTrail.set(shooter.id, this.trail);
    this.volley = null;
    if (this.shotsLeft > 0) {
      this.refireTimer = 0.45;
      return;
    }
    this.summariseShot(shooter);
    this.beginSettle();
  }

  private summariseShot(shooter: Tank): void {
    const enemies = this.world.tanks.filter((t) => t.team !== shooter.team);
    if (this.mods.warp) this.lastShotText = 'วาร์ป!';
    else if (this.volleyDamage > 0) this.lastShotText = `โดน! ดาเมจรวม ${this.volleyDamage}`;
    else if (this.volleyHits.length === 0) this.lastShotText = 'หลุดแผนที่';
    else {
      let d = Infinity;
      for (const h of this.volleyHits) {
        for (const e of enemies) {
          const c = tankCentre(e);
          if (e.alive) d = Math.min(d, Math.hypot(h.x - c.x, h.y - c.y) - TUNING.tankRadius);
        }
      }
      this.lastShotText = `พลาด ห่างเป้า ${Math.max(0, Math.round(d))}px`;
    }
    if (shooter.isBot) this.missStreak.set(shooter.id, this.volleyDamage > 0 ? 0 : (this.missStreak.get(shooter.id) ?? 0) + 1);
  }

  private tickTanks(): void {
    for (const t of this.world.tanks) {
      const wasAlive = t.alive;
      const fallDmg = stepTank(this.world, t);
      if (fallDmg > 0) {
        this.popNumber(t, fallDmg, '#ffd166');
        this.hurt(t);
      }
      if (wasAlive && !t.alive) {
        const drowned = t.y < MAP_H;
        this.ko(drowned ? `${t.name} จมน้ำ!` : `${t.name} ตกขอบ!`);
      }
    }
    this.checkKnockouts();
  }

  private checkKnockouts(): void {
    for (const t of this.world.tanks) {
      if (t.alive && t.hp <= 0) {
        t.alive = false;
        this.ko(`KO! ${t.name}`);
      }
    }
  }

  private beginSettle(): void {
    this.phase = 'settle';
    this.settleTime = 0;
    this.charging = false;
    this.cameras.main.stopFollow();
  }

  private onImpact(shooter: Tank, x: number, y: number, hitTank: Tank | null): void {
    this.volleyHits.push({ x, y });
    if (this.mods.warp) {
      // Teleport the shooter; no crater, no damage. Remaining fragments fizzle.
      for (const s of this.volley!.shells) s.done = true;
      sfx.powerUp();
      this.flash(shooter.x, shooter.y - 20, 30, 0xb197fc);
      shooter.x = Phaser.Math.Clamp(x, 10, MAP_W - 10);
      shooter.y = Math.max(0, Math.floor(y) - 2);
      shooter.vx = 0;
      shooter.vy = 0;
      this.flash(shooter.x, shooter.y - 20, 30, 0xb197fc);
      return;
    }
    const w = this.shotWeapon;
    const res = explode(this.world, x, y, w, this.mods.dmgScale);
    const st = this.stats.get(shooter.id)!;
    let enemyDmg = 0;
    for (const d of res.damaged) {
      if (d.tank.team !== shooter.team) enemyDmg += d.amount;
      this.popNumber(d.tank, d.amount, d.tank.team === shooter.team ? '#ffb4b4' : '#ffffff');
      this.hurt(d.tank);
    }
    st.damage += enemyDmg;
    if (enemyDmg > 0 && this.volleyDamage === 0) st.hits++;
    this.volleyDamage += enemyDmg;

    // Feedback scaled by importance: ground hit = medium, tank hit = large.
    const big = hitTank !== null || res.damaged.some((d) => d.amount >= 150);
    this.cameras.main.shake(big ? 260 : 160, big ? 0.012 : 0.006);
    sfx.explode(big);
    if (big) this.hitStopMs = 80;
    this.flash(x, y, w.radius, 0xfff1c1, big ? 1.8 : 1.4);
    this.debris(x, y, big ? 18 : 10);
    this.checkKnockouts();
  }

  // ---------------------------------------------------------------- camera & fx

  private focusOn(x: number, y: number, duration: number): void {
    const cam = this.cameras.main;
    cam.stopFollow();
    this.camTarget = { x, y };
    cam.pan(x, y, duration, 'Sine.easeInOut', true);
  }

  private ko(text: string): void {
    this.slowMoMs = 500;
    sfx.ko();
    this.cameras.main.shake(320, 0.014);
    this.events.emit('banner', text, 0xffffff);
  }

  private hurt(t: Tank): void {
    const v = this.views.get(t.id);
    if (v) {
      v.flashMs = 120;
      v.hurtMs = 500;
    }
    sfx.hurt();
  }

  private flash(x: number, y: number, r: number, color: number, grow = 1.4): void {
    const f = this.add.circle(x, y, r, color, 0.95).setDepth(20);
    this.tweens.add({ targets: f, scale: grow, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => f.destroy() });
  }

  private debris(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2; // cosmetic only, not the match rng
      const sp = 60 + Math.random() * 140;
      const chunk = this.add.rectangle(x, y, 6, 6, 0x6b4426).setDepth(20);
      this.tweens.add({
        targets: chunk,
        x: x + Math.cos(a) * sp, y: y + Math.sin(a) * sp * 0.6 + 60,
        angle: 360 * Math.random(), alpha: 0,
        duration: 500 + Math.random() * 300, ease: 'Quad.easeOut',
        onComplete: () => chunk.destroy(),
      });
    }
  }

  private dust(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const puff = this.add.circle(x + (Math.random() - 0.5) * 50, y, 10, 0xd9c7a8, 0.8).setDepth(20);
      this.tweens.add({ targets: puff, y: y - 30 - Math.random() * 30, scale: 2, alpha: 0, duration: 500, onComplete: () => puff.destroy() });
    }
  }

  private recoil(t: Tank): void {
    const m = muzzle(t);
    const smoke = this.add.circle(m.x, m.y, 10, 0xeeeeee, 0.8).setDepth(15);
    this.tweens.add({ targets: smoke, scale: 2.2, alpha: 0, duration: 300, onComplete: () => smoke.destroy() });
    this.cameras.main.shake(90, 0.002);
    const v = this.views.get(t.id);
    if (v) {
      v.shootMs = 400;
      const s = v.gun.scaleY;
      v.gun.setScale(v.gun.scaleX * 0.8, s * 1.15);
      this.tweens.add({ targets: v.gun, scaleX: s * t.facing, scaleY: s, duration: 180, ease: 'Back.easeOut' });
    }
  }

  private popNumber(t: Tank, amount: number, color: string): void {
    const c = tankCentre(t);
    this.floatText(c.x, c.y - 40, `-${amount}`, color);
  }

  private floatText(x: number, y: number, str: string, color: string): void {
    const txt = this.add.text(x, y, str, { fontFamily: FONT, fontSize: '34px', color, stroke: '#1b2030', strokeThickness: 6 })
      .setOrigin(0.5).setDepth(30).setScale(1.4);
    this.tweens.add({ targets: txt, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: txt, y: y - 60, alpha: 0, delay: 500, duration: 600, onComplete: () => txt.destroy() });
  }

  // ---------------------------------------------------------------- drawing

  private makeView(t: Tank): TankView {
    const body = this.add.image(t.x, t.y, poseTexture(this, t.char, 'idle')).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(10);
    const gun = this.add.image(t.x, t.y, gunLook(this, CHARACTERS[t.char].weapon).key).setDepth(11);
    const name = this.add.text(t.x, t.y, t.name, {
      fontFamily: FONT, fontSize: '20px', color: Phaser.Display.Color.IntegerToColor(TEAM_COLORS[t.team]).rgba,
      stroke: '#ffffff', strokeThickness: 5,
    }).setOrigin(0.5, 1).setDepth(13);
    return { body, gun, name, flashMs: 0, hurtMs: 0, shootMs: 0, walkT: 0 };
  }

  private drawWorld(delta: number): void {
    const g = this.overlay;
    g.clear();
    const active = this.active;
    const aiming = this.phase === 'aim' || this.phase === 'botAim';

    // last shot's trail for the active tank: the main tool for "adjusting" the next shot
    const prev = this.lastTrail.get(active.id);
    if (prev && aiming) {
      g.fillStyle(0xffffff, 0.45);
      for (let i = 0; i < prev.length; i += 4) g.fillCircle(prev[i].x, prev[i].y, 2.5);
    }

    const now = this.time.now;
    for (const t of this.world.tanks) this.drawTank(t, t === active, delta, now);
    this.drawAim(active, aiming && active.alive && !active.burrowed);

    // shells
    const shells = this.volley ? this.volley.shells.filter((s) => !s.done) : [];
    while (this.shellImgs.length < shells.length) this.shellImgs.push(this.add.image(0, 0, shellKey('cannon')).setDepth(14).setScale(ART_SCALE * 1.4));
    this.shellImgs.forEach((img, i) => {
      const s = shells[i];
      img.setVisible(!!s);
      if (!s) return;
      img.setTexture(shellKey(this.shotWeapon.id)).setPosition(s.x, s.y);
      img.setRotation(this.shotWeapon.id === 'hammer' ? s.frames * 0.25 : Math.atan2(s.vy, s.vx));
    });

    const fx = this.fxGfx;
    fx.clear();
    if (shells.length) {
      fx.fillStyle(0xffffff, 0.35);
      for (let i = Math.max(0, this.trail.length - 30); i < this.trail.length; i++) fx.fillCircle(this.trail[i].x, this.trail[i].y, 3);
      const top = this.cameras.main.scrollY;
      for (const s of shells) {
        if (s.y >= top) continue;
        fx.fillStyle(0xffd166, 1); // off-screen-above indicator
        fx.fillTriangle(s.x - 12, top + 26, s.x + 12, top + 26, s.x, top + 8);
      }
    }
    // sudden-death water
    const wy = this.world.waterY;
    if (wy < MAP_H) {
      g.fillStyle(0x3a86ff, 0.55);
      g.fillRect(0, wy, MAP_W, MAP_H - wy);
      g.lineStyle(4, 0xbde0fe, 0.9);
      g.beginPath();
      for (let x = 0; x <= MAP_W; x += 20) g.lineTo(x, wy + Math.sin(x / 40 + now / 300) * 4);
      g.strokePath();
    }

    if (this.phase === 'settle' || this.phase === 'botThink' || this.manualCam) return;
    if (aiming) {
      // keep the active tank framed while it walks
      const c = tankCentre(active);
      const cam = this.cameras.main;
      if (!cam.panEffect.isRunning && Math.abs(c.x - this.camTarget.x) > 300) this.focusOn(c.x, c.y, 400);
    }
  }

  private drawTank(t: Tank, isActive: boolean, delta: number, now: number): void {
    const v = this.views.get(t.id)!;
    const g = this.overlay;
    const c = tankCentre(t);
    const deadPose = !t.alive;
    const gone = deadPose && t.y >= MAP_H;
    v.body.setVisible(!gone && !t.burrowed);
    v.name.setVisible(t.alive);
    if (gone) return;

    if (t.burrowed) {
      // a dirt mound with eyes peeking out
      g.fillStyle(0x7a5638, 1);
      g.fillEllipse(t.x, t.y - 6, 54, 26);
      g.fillStyle(0x1b2030, 1);
      g.fillCircle(t.x - 7, t.y - 12, 3);
      g.fillCircle(t.x + 7, t.y - 12, 3);
      return;
    }

    // body: pose by state, idle breathing, a hop while walking, flipped by facing
    const posed = hasArt(this, `art-${t.char}-idle`); // generated pose sprites vs the drawn placeholder
    const moving = isActive && !t.airborne && (this.phase === 'botWalk' || this.phase === 'aim' && (this.touch.move !== 0 || this.keys.LEFT.isDown || this.keys.RIGHT.isDown || this.keys.A.isDown || this.keys.D.isDown)) && this.turns.fuel > 0;
    v.walkT = moving ? v.walkT + delta : 0;
    const hop = moving ? Math.abs(Math.sin(v.walkT / 90)) * 4 : 0;
    const breathe = 1 + Math.sin(now / 400 + t.id) * 0.025;
    v.hurtMs = Math.max(0, v.hurtMs - delta);
    v.shootMs = Math.max(0, v.shootMs - delta);
    const aiming = isActive && (this.phase === 'aim' || this.phase === 'botAim' || this.phase === 'botThink');
    let pose: Pose = 'idle';
    if (deadPose) pose = 'dead';
    else if (v.hurtMs > 0) pose = 'hurt';
    else if (v.shootMs > 0) pose = 'shoot';
    else if (moving) pose = Math.floor(v.walkT / 170) % 2 ? 'walk' : 'idle';
    else if (aiming) pose = 'aim';
    v.body.setTexture(poseTexture(this, t.char, pose));
    v.body.setPosition(t.x, t.y - hop).setFlipX(t.facing < 0);
    v.body.setScale(ART_SCALE, ART_SCALE * (deadPose ? 1 : breathe));
    v.body.setRotation(deadPose && !posed ? (Math.PI / 2) * -t.facing : 0).setAlpha(deadPose ? 0.75 : 1);
    // With pose art the weapon is only in hand while aiming or firing; the placeholder always holds it.
    v.gun.setVisible(t.alive && !t.burrowed && (!posed || pose === 'aim' || pose === 'shoot'));
    if (v.flashMs > 0) {
      v.flashMs -= delta;
      v.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    } else {
      v.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    }
    if (deadPose) return;

    const look = gunLook(this, isActive && this.useDrill ? 'drill' : CHARACTERS[t.char].weapon);
    v.gun.setTexture(look.key).setOrigin(look.ox, look.oy);
    v.gun.setPosition(c.x + (posed ? 6 * t.facing : 0), c.y + (posed ? 6 : 4) - hop);
    v.gun.setRotation((-t.angle * Math.PI) / 180 * t.facing);
    if (!this.tweens.isTweening(v.gun)) v.gun.setScale(look.scale * t.facing, look.scale);

    // team ring, armor bubble, over-head HP and name
    g.fillStyle(TEAM_COLORS[t.team], 0.5);
    g.fillEllipse(t.x, t.y, 50, 10);
    if (t.armored) {
      g.lineStyle(4, 0x8ecae6, 0.9);
      g.strokeCircle(c.x, c.y - 8, 40);
    }
    const w = 60;
    const top = t.y - 82 - hop;
    g.fillStyle(0x1b2030, 0.8);
    g.fillRect(t.x - w / 2 - 2, top, w + 4, 10);
    g.fillStyle(hpColor(t.hp), 1);
    g.fillRect(t.x - w / 2, top + 2, (w * t.hp) / TUNING.maxHp, 6);
    v.name.setPosition(t.x, top - 2);
    if (isActive && this.phase !== 'over') {
      const bob = Math.sin(now / 180) * 4;
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(t.x - 10, top - 44 + bob, t.x + 10, top - 44 + bob, t.x, top - 28 + bob);
    }
  }

  /**
   * Aim dial around the active character: a 0–90° arc on the facing side with
   * 10° ticks, the current angle as a filled sweep plus an arrow, the number at
   * the arrow tip, and a red tick where the last shot was aimed.
   */
  private drawAim(t: Tank, show: boolean): void {
    const g = this.aimGfx;
    g.clear();
    this.aimLabel.setVisible(show);
    if (!show) return;
    const c = tankCentre(t);
    const f = t.facing;
    // screen angle (y down) of an aim angle on this side
    const at = (deg: number) => (f > 0 ? -deg : 180 + deg) * (Math.PI / 180);
    const pt = (deg: number, r: number) => ({ x: c.x + Math.cos(at(deg)) * r, y: c.y + Math.sin(at(deg)) * r });
    const arc = (from: number, to: number, r: number) => {
      g.beginPath();
      const a0 = at(from);
      const a1 = at(to);
      g.arc(c.x, c.y, r, Math.min(a0, a1), Math.max(a0, a1), false);
      g.strokePath();
    };

    // backing band and ticks
    g.lineStyle(20, 0x1b2030, 0.45);
    arc(0, 90, AIM_R);
    g.lineStyle(2, 0xffffff, 0.6);
    arc(0, 90, AIM_R + 10);
    arc(0, 90, AIM_R - 10);
    g.lineStyle(3, 0xffffff, 0.9);
    for (let d = 0; d <= 90; d += 10) {
      const long = d % 30 === 0;
      const a = pt(d, AIM_R - (long ? 9 : 5));
      const b = pt(d, AIM_R + (long ? 9 : 5));
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    // current angle sweep
    const team = TEAM_COLORS[t.team];
    g.lineStyle(12, 0xffd166, 0.9);
    if (t.angle > 0.5) arc(0, t.angle, AIM_R);
    // last shot's angle
    const last = this.lastAngle.get(t.id);
    if (last !== undefined) {
      const a = pt(last, AIM_R - 12);
      const b = pt(last, AIM_R + 12);
      g.lineStyle(4, 0xff4d4d, 0.95);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    // arrow from the body out past the dial
    const tail = pt(t.angle, 26);
    const tip = pt(t.angle, AIM_R + 30);
    g.lineStyle(9, 0x1b2030, 0.6);
    g.lineBetween(tail.x, tail.y, tip.x, tip.y);
    g.lineStyle(5, 0xffffff, 1);
    g.lineBetween(tail.x, tail.y, tip.x, tip.y);
    const l = pt(t.angle + 8, AIM_R + 12);
    const r = pt(t.angle - 8, AIM_R + 12);
    g.fillStyle(team, 1);
    g.fillTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
    g.lineStyle(2, 0xffffff, 1);
    g.strokeTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
    const lbl = pt(t.angle, AIM_R + 52);
    this.aimLabel.setText(`${Math.round(t.angle)}°`).setPosition(lbl.x, lbl.y);
  }
}

const AIM_R = 100;

export function hpColor(hp: number): number {
  const k = hp / TUNING.maxHp;
  return k > 0.5 ? 0x4ade80 : k > 0.25 ? 0xfacc15 : 0xf87171;
}
