import Phaser from 'phaser';
import { ART_SCALE, Pose, gunLook, hasArt, lookHand, lookRes, lookTexture, shellKey } from '../art/chibi';
import { Rng, createRng } from '../core/rng';
import { TurnManager } from '../core/TurnManager';
import { BotAction, ShotPlanner, Shot, chooseAttackItem, chooseSupport } from '../core/BotAI';
import { TurnMods, freshMods, skillOf, useItem, useSkill } from '../core/Actions';
import { ITEMS, ITEM_IDS, ItemId, LIMITS, SKILLS, WEAPONS, WeaponDef } from '../core/data';
import { randomLoadout } from '../core/gear';
import { MAP_H, MAP_W, MapId, generateMap, spawnX } from '../core/Maps';
import { ShotEvent, ShotRun, stepTanks } from '../core/Match';
import { Terrain, decodeMask, terrainHash } from '../core/Terrain';
import { TUNING, Tank, World, createTank, createWorld, isSettled, muzzle, tankCentre, walk } from '../core/World';
import { FONT, TEAM_COLORS } from '../ui/widgets';
import { isMuted, setCharge, setMuted, sfx, stopCharge } from '../audio/sfx';
import { net } from '../net/NetClient';
import { MatchView, ServerMsg, TurnInfo } from '../net/protocol';
import { MatchSetup, loadSetup } from './setup';

/**
 * Offline, the scene runs everything. Online, the server decides: the local player's
 * actions are sent and only applied when the server echoes them back, other players'
 * turns are watched ('remote'), and after each shot the scene waits ('wait') for the
 * server's next turn, which carries the true state.
 */
export type Phase = 'aim' | 'botThink' | 'botWalk' | 'botAim' | 'remote' | 'wait' | 'flying' | 'settle' | 'over';

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
  /** Online match against other people (see Phase). */
  net = false;
  /** Online: the tank this browser controls (-1 = watching). */
  myTank = 0;

  private rng!: Rng;
  private acc = 0;
  private hitStopMs = 0;
  private slowMoMs = 0;

  // shot in flight
  private run: ShotRun | null = null;
  private shotWeapon: WeaponDef = WEAPONS.cannon;
  private trail: { x: number; y: number }[] = [];
  private lastTrail = new Map<number, { x: number; y: number }[]>();
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

  // online
  private moveTick = 0;
  private lastSent = '';
  private remoteMoveMs = 0;
  private netHandler = (msg: ServerMsg) => this.onNet(msg);

  // camera
  private manualCam = false;
  private camTarget = { x: 0, y: 0 };

  // rendering
  private terrainTex!: Phaser.Textures.CanvasTexture;
  private terrainImgs: Phaser.GameObjects.Image[] = [];
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

  init(data?: { online?: boolean }): void {
    // Reset per-run state here (the scene instance is reused on restart).
    this.net = !!data?.online && !!net.match;
    this.setup = loadSetup(this.registry);
    if (this.net) {
      const { config, you } = net.match!;
      this.setup = { ...this.setup, map: config.map, format: config.format, difficulty: config.difficulty };
      this.myTank = you;
    } else this.myTank = 0;
    this.moveTick = 0;
    this.lastSent = '';
    this.remoteMoveMs = 0;
    this.terrainImgs = [];
    this.phase = 'aim';
    this.acc = 0;
    this.hitStopMs = 0;
    this.slowMoMs = 0;
    this.power = 0;
    this.charging = false;
    this.mods = freshMods();
    this.useDrill = false;
    this.run = null;
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
    const view = this.net ? net.match! : null;
    if (view) {
      const terrain = new Terrain(MAP_W, MAP_H);
      decodeMask(terrain, view.terrain);
      this.world = createWorld(terrain, view.tanks.map((t) => ({ ...t, items: [...t.items] })));
    } else {
      const terrain = generateMap(this.setup.map, this.rng);
      this.world = createWorld(terrain, this.buildTeams(terrain));
    }
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
      net.off('any', this.netHandler);
      this.scene.stop('hud');
    });
    if (view) {
      net.on('any', this.netHandler);
      this.netTurn(view.turn, view.tanks);
    } else this.startTurn();
  }

  private buildTeams(terrain: World['terrain']): Tank[] {
    const { format, loadout, items } = this.setup;
    const botLook = () => randomLoadout(this.rng);
    const botItems = (): ItemId[] => {
      const pool = [...ITEM_IDS];
      return Array.from({ length: LIMITS.itemsPerMatch }, () => pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
    };
    const tanks: Tank[] = [createTank(0, 'คุณ', 0, false, spawnX(this.setup.map, 0, 0), terrain, loadout, items)];
    if (format === '2v2') tanks.push(createTank(tanks.length, 'เพื่อนบอท', 0, true, spawnX(this.setup.map, 0, 1), terrain, botLook(), botItems()));
    const enemies = format === '1v1' ? 1 : 2;
    for (let i = 0; i < enemies; i++) {
      tanks.push(createTank(tanks.length, enemies > 1 ? `บอท ${i + 1}` : 'บอท', 1, true, spawnX(this.setup.map, 1, i), terrain, botLook(), botItems()));
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
    this.terrainImgs.push(this.add.image(0, 0, 'terrain').setOrigin(0, 0).setDepth(1));
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
    this.terrainImgs.push(this.add.image(0, 0, 'terrain-back').setOrigin(0, 0).setDepth(0.5));
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
    this.keys.R.on('down', () => {
      if (!this.net) this.scene.restart();
    });
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

  /** True while the local player may walk, aim, pick weapons and use items. */
  get humanCanAct(): boolean {
    return this.phase === 'aim' && this.isLocal(this.active) && !this.charging;
  }

  /** Controlled from this browser. */
  isLocal(t: Tank): boolean {
    return this.net ? t.id === this.myTank : !t.isBot;
  }

  /** The team this browser plays for (wins and losses are from its side). */
  get myTeam(): number {
    return this.net ? (this.world.tanks[this.myTank]?.team ?? 0) : 0;
  }

  get mainWeapon(): WeaponDef {
    return WEAPONS[this.active.loadout.weapon];
  }

  selectWeapon(drill: boolean): void {
    if (!this.humanCanAct) return;
    this.useDrill = drill && this.active.drillLeft > 0;
  }

  useItemSlot(slot: number): void {
    if (!this.humanCanAct) return;
    if (this.net) net.send({ t: 'item', slot });
    else this.applyItem(this.active, slot);
  }

  useSkillNow(): void {
    if (!this.humanCanAct) return;
    if (this.net) net.send({ t: 'skill' });
    else this.applySkill(this.active);
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
    if (this.net) {
      net.send({ t: 'away' });
      this.scene.start(net.room?.ranked ? 'ranked' : 'lobby');
    } else this.scene.start('menu');
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
    this.beginTurn(this.turns.next());
  }

  private beginTurn(t: Tank): void {
    this.mods = freshMods();
    this.useDrill = false;
    this.power = 0;
    this.charging = false;
    this.manualCam = false;
    this.focusOn(tankCentre(t).x, tankCentre(t).y, 600);
    const mine = t.team === this.myTeam;
    const who = this.isLocal(t) ? 'ตาของคุณ' : t.isBot && mine && !this.net ? 'ตาของเพื่อนบอท' : `ตาของ${t.name}`;
    this.events.emit('banner', who, TEAM_COLORS[t.team]);
    if (this.turns.turnNumber === TUNING.suddenDeathTurn + 1) {
      this.time.delayedCall(900, () => this.events.emit('banner', 'Sudden death! น้ำกำลังขึ้น', 0x8ecae6));
    }
    if (this.net) {
      this.phase = this.isLocal(t) ? 'aim' : 'remote';
      if (this.phase === 'aim') sfx.turn();
    } else if (t.isBot) {
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
    if (this.net) {
      // the server decides what happens next; tell it we're done watching
      this.phase = 'wait';
      net.send({ t: 'settled', turn: this.turns.turnNumber });
      return;
    }
    const w = this.turns.winner();
    if (w !== null) {
      this.phase = 'over';
      this.winner = w;
      this.events.emit('over', w);
      this.time.delayedCall(700, () => (w === this.myTeam ? sfx.win() : sfx.lose()));
      return;
    }
    this.startTurn();
  }

  // ---------------------------------------------------------------- online

  private onNet(msg: ServerMsg): void {
    const tanks = this.world.tanks;
    switch (msg.t) {
      case 'turn':
        this.netTurn(msg.turn, msg.tanks);
        if (terrainHash(this.world.terrain) !== msg.hash) net.send({ t: 'needTerrain' });
        break;
      case 'move': {
        const t = tanks[msg.id];
        if (!t || msg.id === this.myTank) break;
        if (Math.abs(t.x - msg.x) > 0.5) this.remoteMoveMs = 150;
        Object.assign(t, { x: msg.x, y: msg.y, facing: msg.facing, angle: msg.angle });
        if (t === this.active) this.power = msg.power;
        break;
      }
      case 'item':
        if (tanks[msg.id]) this.applyItem(tanks[msg.id], msg.slot);
        break;
      case 'skill':
        if (tanks[msg.id]) this.applySkill(tanks[msg.id]);
        break;
      case 'shot': {
        const t = tanks[msg.id];
        if (!t) break;
        // Same start state as the server, then the usual turn-and-charge animation.
        Object.assign(t, { x: msg.x, y: msg.y, facing: msg.facing });
        this.useDrill = msg.drill;
        this.botShot = { angle: msg.angle, power: msg.power, facing: msg.facing };
        this.charging = false;
        this.phase = 'botAim';
        break;
      }
      case 'terrain':
        decodeMask(this.world.terrain, msg.terrain);
        this.world.terrain.changes.length = 0;
        for (const img of this.terrainImgs) img.destroy();
        this.terrainImgs = [];
        this.paintTerrain();
        break;
      case 'over':
        this.applyTanks(msg.tanks);
        this.run = null;
        this.phase = 'over';
        this.winner = msg.winner;
        this.events.emit('over', msg.winner);
        this.time.delayedCall(700, () => (msg.winner === this.myTeam ? sfx.win() : sfx.lose()));
        break;
      case 'match':
        this.scene.restart({ online: true }); // reconnected: rebuild from the server's state
        break;
      case 'left':
        this.scene.start('lobby');
        break;
    }
  }

  /** Server says whose turn it is; its tank states replace ours (fixes any drift). */
  private netTurn(info: TurnInfo, tanks: MatchView['tanks']): void {
    this.applyTanks(tanks);
    this.run = null;
    const tm = this.turns;
    tm.current = info.active;
    tm.turnNumber = info.turnNumber;
    tm.timeLeft = info.timeLeft;
    tm.fuel = TUNING.fuelPerTurn * tm.active.move;
    this.world.wind = info.wind;
    this.world.waterY = info.waterY ?? Infinity;
    this.beginTurn(tm.active);
  }

  private applyTanks(tanks: MatchView['tanks']): void {
    for (const s of tanks) {
      const t = this.world.tanks[s.id];
      if (t) Object.assign(t, s, { items: [...s.items] });
    }
  }

  private sendFire(t: Tank): void {
    net.send({
      t: 'fire', x: t.x, y: t.y, facing: t.facing, angle: Math.round(t.angle), power: Math.round(this.power), drill: this.useDrill,
    });
    this.charging = false;
    this.phase = 'wait';
  }

  /** Stream our position and aim ~10 times a second while it changes. */
  private sendMove(t: Tank): void {
    if (++this.moveTick % 6 !== 0) return;
    const m = { x: t.x, y: t.y, facing: t.facing, angle: Math.round(t.angle * 10) / 10, power: Math.round(this.power) };
    const key = JSON.stringify(m);
    if (key === this.lastSent) return;
    this.lastSent = key;
    net.send({ t: 'move', ...m });
  }

  private fire(t: Tank): void {
    t.angle = Math.round(t.angle);
    this.power = Math.round(this.power);
    this.lastPower.set(t.id, this.power);
    this.lastAngle.set(t.id, t.angle);
    this.shotWeapon = this.useDrill ? WEAPONS.drill : WEAPONS[t.loadout.weapon];
    if (this.useDrill) t.drillLeft--;
    this.charging = false;
    this.stats.get(t.id)!.shots++;
    this.volleyDamage = 0;
    this.run = new ShotRun(this.world, t, this.shotWeapon, this.power, this.mods);
    this.phase = 'flying';
    this.manualCam = false;
    const m = muzzle(t);
    this.camProxy.x = m.x;
    this.camProxy.y = m.y;
    this.cameras.main.startFollow(this.camProxy, false, 0.12, 0.12);
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
    const watchedCharge = (this.phase === 'botAim' || this.phase === 'remote') && this.power > 0;
    if ((this.phase === 'aim' && this.charging) || watchedCharge) setCharge(this.power);
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

      case 'remote':
        this.turns.timeLeft = Math.max(0, this.turns.timeLeft - dt);
        this.tickTanks();
        break;

      case 'wait':
        this.tickTanks();
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
        this.tickFlying(active);
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
      if (this.charging) this.release(t);
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
      this.release(t);
      return;
    }
    if (this.net) this.sendMove(t);
  }

  private release(t: Tank): void {
    if (this.net) this.sendFire(t);
    else this.fire(t);
  }

  private tickBotThink(bot: Tank, dt: number): void {
    this.botTimer -= dt;
    if (this.botTimer > 0 || !isSettled(this.world)) return;
    const difficulty = this.setup.difficulty;
    if (!this.planner) {
      if (!this.botSupportDone) {
        this.botSupportDone = true;
        for (const a of chooseSupport(this.world, bot, skillOf(bot), difficulty)) {
          this.applyBotAction(bot, a);
          if (this.phase !== 'botThink') return; // burrow ended the turn
        }
      }
      const opts = { weapon: this.mainWeapon, noWind: this.mods.noWind, dmgScale: this.mods.dmgScale * bot.atk, splitCount: this.mods.splitCount };
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

  private tickFlying(shooter: Tank): void {
    const run = this.run!;
    for (const ev of run.step()) this.onShotEvent(shooter, ev);
    const lead = run.volley?.shells.find((s) => !s.done);
    if (lead) {
      this.trail.push({ x: lead.x, y: lead.y });
      this.camProxy.x = lead.x;
      this.camProxy.y = lead.y;
    }
  }

  private onShotEvent(shooter: Tank, ev: ShotEvent): void {
    switch (ev.kind) {
      case 'launch':
        sfx.fire(this.shotWeapon.id === 'hammer');
        this.trail = [];
        this.recoil(shooter);
        break;
      case 'impact':
        this.onImpact(shooter, ev);
        break;
      case 'warp':
        sfx.powerUp();
        this.flash(ev.from.x, ev.from.y - 20, 30, 0xb197fc);
        this.flash(ev.to.x, ev.to.y - 20, 30, 0xb197fc);
        break;
      case 'carve':
        sfx.drill();
        if (Math.random() < 0.3) this.debris(ev.x, ev.y, 2); // cosmetic only, not the match rng
        break;
      case 'split':
        this.flash(ev.x, ev.y, 18, 0xffd166);
        sfx.split();
        break;
      case 'volleyEnd':
        this.lastTrail.set(shooter.id, this.trail);
        break;
      case 'end':
        this.summariseShot(shooter);
        this.beginSettle();
        break;
    }
  }

  private summariseShot(shooter: Tank): void {
    const enemies = this.world.tanks.filter((t) => t.team !== shooter.team);
    const hits = this.run!.hits;
    if (this.mods.warp) this.lastShotText = 'วาร์ป!';
    else if (this.volleyDamage > 0) this.lastShotText = `โดน! ดาเมจรวม ${this.volleyDamage}`;
    else if (hits.length === 0) this.lastShotText = 'หลุดแผนที่';
    else {
      let d = Infinity;
      for (const h of hits) {
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
    const ev = stepTanks(this.world);
    for (const f of ev.falls) {
      this.popNumber(f.tank, f.amount, '#ffd166');
      this.hurt(f.tank);
    }
    for (const o of ev.out) {
      const name = o.tank.name;
      this.ko(o.how === 'drown' ? `${name} จมน้ำ!` : o.how === 'fall' ? `${name} ตกขอบ!` : `KO! ${name}`);
    }
  }

  private beginSettle(): void {
    this.phase = 'settle';
    this.settleTime = 0;
    this.charging = false;
    this.cameras.main.stopFollow();
  }

  private onImpact(shooter: Tank, ev: Extract<ShotEvent, { kind: 'impact' }>): void {
    const { x, y, damaged } = ev;
    const w = this.shotWeapon;
    const st = this.stats.get(shooter.id)!;
    let enemyDmg = 0;
    for (const d of damaged) {
      if (d.tank.team !== shooter.team) enemyDmg += d.amount;
      this.popNumber(d.tank, d.amount, d.tank.team === shooter.team ? '#ffb4b4' : '#ffffff');
      this.hurt(d.tank);
    }
    st.damage += enemyDmg;
    if (enemyDmg > 0 && this.volleyDamage === 0) st.hits++;
    this.volleyDamage += enemyDmg;

    // Feedback scaled by importance: ground hit = medium, tank hit = large.
    const big = ev.hitTank !== null || damaged.some((d) => d.amount >= 150);
    this.cameras.main.shake(big ? 260 : 160, big ? 0.012 : 0.006);
    sfx.explode(big);
    if (big) this.hitStopMs = 80;
    this.flash(x, y, w.radius, 0xfff1c1, big ? 1.8 : 1.4);
    this.debris(x, y, big ? 18 : 10);
    for (const t of ev.ko) this.ko(`KO! ${t.name}`);
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
    const body = this.add.image(t.x, t.y, lookTexture(this, t.loadout)).setOrigin(0.5, 1).setScale(ART_SCALE * lookRes()).setDepth(10);
    const gun = this.add.image(t.x, t.y, gunLook(this, t.loadout.weapon).key).setDepth(11);
    const name = this.add.text(t.x, t.y, t.name, {
      fontFamily: FONT, fontSize: '20px', color: Phaser.Display.Color.IntegerToColor(TEAM_COLORS[t.team]).rgba,
      stroke: '#ffffff', strokeThickness: 5,
    }).setOrigin(0.5, 1).setDepth(13);
    return { body, gun, name, flashMs: 0, hurtMs: 0, shootMs: 0, walkT: 0 };
  }

  private drawWorld(delta: number): void {
    this.remoteMoveMs = Math.max(0, this.remoteMoveMs - delta);
    const g = this.overlay;
    g.clear();
    const active = this.active;
    const aiming = this.phase === 'aim' || this.phase === 'botAim' || this.phase === 'remote';

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
    const shells = this.run?.volley ? this.run.volley.shells.filter((s) => !s.done) : [];
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

    if (this.phase === 'settle' || this.phase === 'botThink' || this.phase === 'wait' || this.manualCam) return;
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
    const posed = false; // no painted pose sprites for the dress-up chibi yet: poses are body transforms
    const moving = isActive && !t.airborne && (this.phase === 'botWalk' || this.phase === 'remote' && this.remoteMoveMs > 0 || this.phase === 'aim' && (this.touch.move !== 0 || this.keys.LEFT.isDown || this.keys.RIGHT.isDown || this.keys.A.isDown || this.keys.D.isDown)) && this.turns.fuel > 0;
    v.walkT = moving ? v.walkT + delta : 0;
    const hop = moving ? Math.abs(Math.sin(v.walkT / 90)) * 4 : 0;
    const breathe = 1 + Math.sin(now / 400 + t.id) * 0.025;
    v.hurtMs = Math.max(0, v.hurtMs - delta);
    v.shootMs = Math.max(0, v.shootMs - delta);
    const aiming = isActive && (this.phase === 'aim' || this.phase === 'botAim' || this.phase === 'botThink' || this.phase === 'remote' && this.remoteMoveMs === 0);
    let pose: Pose = 'idle';
    if (deadPose) pose = 'dead';
    else if (v.hurtMs > 0) pose = 'hurt';
    else if (v.shootMs > 0) pose = 'shoot';
    else if (moving) pose = Math.floor(v.walkT / 170) % 2 ? 'walk' : 'idle';
    else if (aiming) pose = 'aim';
    v.body.setTexture(lookTexture(this, t.loadout));
    v.body.setPosition(t.x, t.y - hop).setFlipX(t.facing < 0);
    v.body.setScale(ART_SCALE * lookRes(), ART_SCALE * lookRes() * (deadPose ? 1 : breathe));
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

    const look = gunLook(this, isActive && this.useDrill ? 'drill' : t.loadout.weapon);
    v.gun.setTexture(look.key).setOrigin(look.ox, look.oy);
    const hand = lookHand();
    if (hand) v.gun.setPosition(t.x + hand.x * ART_SCALE * t.facing, t.y + hand.y * ART_SCALE - hop);
    else v.gun.setPosition(c.x + (posed ? 6 * t.facing : 0), c.y + (posed ? 6 : 4) - hop);
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
    g.fillStyle(hpColor(t.hp, t.maxHp), 1);
    g.fillRect(t.x - w / 2, top + 2, (w * t.hp) / t.maxHp, 6);
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

export function hpColor(hp: number, max: number): number {
  const k = hp / max;
  return k > 0.5 ? 0x4ade80 : k > 0.25 ? 0xfacc15 : 0xf87171;
}
