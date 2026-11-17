import Phaser from 'phaser';
import { lookTexture } from '../art/chibi';
import { Difficulty } from '../core/BotAI';
import { WEAPONS } from '../core/data';
import { MAPS, MAP_IDS, MapId } from '../core/Maps';
import { account } from '../net/account';
import { net } from '../net/NetClient';
import { OnlineFormat, PlayerView, Profile, RoomConfig, ServerMsg, TEAM_SIZE } from '../net/protocol';
import { Box, PlateButton, STROKE, filled, fitted, mockupBox, placed, screenChrome } from '../ui/plates';
import { FONT, fit, label } from '../ui/widgets';
import { DIFF_LABEL, loadSetup } from './setup';

const NAME_KEY = 'crater-clash:name';
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const FORMATS: OnlineFormat[] = ['1v1', '2v2'];

/** Where each piece sits in the designer's 1672x941 mockup (new_ui/black-boom-lobby-parts/layout.json). */
const box = (b: Box): Box => mockupBox(b, 1672);
const L = (name: string) => `ui-lobby/${name}`;
/** The room view's own mockup (new_ui/black-boom-room-parts 2/layout.json) is 1681x936. */
const rbox = (b: Box): Box => mockupBox(b, 1681);
const R = (name: string) => `ui-room/${name}`;
const WIFI_HINT = 'เล่นด้วยกันผ่าน Wi-Fi วงเดียวกัน หรืออินเทอร์เน็ตก็ได้';
const DIVIDER = 0x8991b6;

/**
 * Friend rooms: create or join by 6-digit code, pick teams, host picks the rules.
 * The entry view is built to the painted mockup (name box, wardrobe, create / join, code
 * box, two fighters either side); the room view is built to the room mockup on its own arena.
 * Back, title plate and wallet are built once; render() rebuilds the view under them.
 */
export default class LobbyScene extends Phaser.Scene {
  private ui: Phaser.GameObjects.GameObject[] = [];
  /** The line that says whether the server is reachable (wifi hint, or the room's subtitle). */
  private status: Phaser.GameObjects.Text | null = null;
  /** The yellow marks either side of the room's status line. */
  private marks: [Phaser.GameObjects.Image, Phaser.GameObjects.Image] | null = null;
  private bg!: Phaser.GameObjects.Image;
  private statusIdle = '';
  private setTitle: (title: string) => void = () => undefined;
  private hint!: Phaser.GameObjects.Text;
  private handler = (msg: ServerMsg) => this.onNet(msg);
  private statusHandler = () => this.render();
  private nameInput: HTMLInputElement | null = null;
  private codeInput: HTMLInputElement | null = null;
  private failTimer: Phaser.Time.TimerEvent | null = null;
  private live = false;
  private busy = false;

  constructor() {
    super('lobby');
  }

  create(): void {
    // the battle's key bindings (W, A, S, D, E, R...) stay captured game-wide and would eat letters typed here
    this.input.keyboard?.clearCaptures();
    inputStyle();
    this.bg = this.add.image(960, 540, L('bg'));
    this.chrome();
    this.hint = label(this, 960, 1030, '', 28, '#ffd166').setOrigin(0.5).setDepth(10);

    net.on('any', this.handler);
    net.on('status', this.statusHandler);
    this.live = true;
    this.busy = false;
    // the account loads after the view on a cold start: fill the empty name box once it does
    const stopAccount = account.onChange(() => {
      if (this.nameInput && !this.nameInput.value && account.view) this.nameInput.value = account.view.displayName;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      stopAccount();
      this.live = false;
      this.ui = [];
      net.off('any', this.handler);
      net.off('status', this.statusHandler);
    });
    net.connect();
    if (this.registry.get('setupMode') === 'online') {
      // back from picking a character/items: tell the room
      this.registry.set('setupMode', null);
      if (net.room) net.send({ t: 'profile', ...this.profile() });
    }
    this.render();
  }

  /** Back to the menu (leaving any room), the title plate, wallet and settings. */
  private chrome(): void {
    this.setTitle = screenChrome(this, { title: 'เล่นกับเพื่อน', icon: L('people'), onBack: () => this.toMenu() });
  }

  /** Connected: the view's own line. Not yet: say so, and after a few seconds say the server seems down. */
  private showStatus(): void {
    this.failTimer?.remove();
    this.failTimer = null;
    const set = (t: string, color: string) => {
      this.status?.setText(t).setColor(color);
      this.placeMarks();
    };
    if (net.connected) return void set(this.statusIdle, '#ffffff');
    set('กำลังต่อเซิร์ฟเวอร์…', '#ffd166');
    this.failTimer = this.time.delayedCall(3000, () => {
      if (!net.connected) set('ต่อเซิร์ฟเวอร์ไม่ได้ (เปิด npm run server หรือยัง?)', '#ff8787');
    });
  }

  private onNet(msg: ServerMsg): void {
    if (msg.t === 'match') {
      this.scene.start('battle', { online: true });
      return;
    }
    if (msg.t === 'room' && msg.room.ranked) {
      this.scene.start('ranked'); // reloaded during a ranked match
      return;
    }
    if (msg.t === 'error') this.say(msg.msg);
    if (msg.t === 'room' || msg.t === 'left' || msg.t === 'joined') this.render();
  }

  private profile(): Profile {
    const s = loadSetup(this.registry);
    const name = this.nameInput?.value.trim() || account.view?.displayName || this.savedName();
    return { name, loadout: s.loadout, items: s.items };
  }

  private savedName(): string {
    try {
      return localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      return '';
    }
  }

  private rememberName(): void {
    try {
      localStorage.setItem(NAME_KEY, this.profile().name);
    } catch {
      // ignore
    }
  }

  private say(msg: string): void {
    this.hint.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.hint);
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 2200, duration: 400 });
  }

  // ---------------------------------------------------------------- views

  private clear(): void {
    for (const o of this.ui) o.destroy();
    this.ui = [];
    this.nameInput = null;
    this.codeInput = null;
  }

  private add_<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.ui.push(o);
    return o;
  }

  private render(): void {
    if (!this.live) return;
    this.clear();
    this.status = null;
    this.marks = null;
    this.bg.setTexture(L('bg'));
    this.bg.setScale(Math.max(1920 / this.bg.width, 1080 / this.bg.height));
    if (net.room) this.roomView();
    else if (!net.inRoom) this.entryView();
    this.showStatus();
  }

  private toMenu(): void {
    if (net.room) net.leave();
    this.scene.start('menu');
  }

  /**
   * A real text input laid over a painted input plate: `inner` is where the typing area sits
   * inside the plate (fractions, from the mockup). Enter runs `onEnter`.
   */
  private textBox(key: string, b: Box, inner: Box, opts: { value: string; placeholder: string; max: number; size: number; numeric?: boolean; onEnter: () => void }): HTMLInputElement {
    this.add_(filled(this, key, b));
    const [x, y, w, h] = b;
    const [ix, iy, iw, ih] = inner;
    const el = document.createElement('input');
    el.className = 'bb-input';
    el.value = opts.value;
    el.placeholder = opts.placeholder;
    el.maxLength = opts.max;
    if (opts.numeric) {
      el.inputMode = 'numeric';
      el.addEventListener('input', () => (el.value = el.value.replace(/\D/g, '').slice(0, opts.max)));
    }
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') opts.onEnter();
    });
    el.style.cssText = `width:${Math.round(w * iw)}px;height:${Math.round(h * ih)}px;font:700 ${opts.size}px ${FONT};text-align:center;`;
    this.add_(this.add.dom(x + w * (ix + iw / 2), y + h * (iy + ih / 2), el));
    return el;
  }

  private entryView(): void {
    const p = this.profile();
    this.setTitle('เล่นกับเพื่อน');
    this.add_(filled(this, L('panel'), box([252, 152, 1167, 694])));

    // your name, with a pencil that puts the cursor in the box
    this.add_(placed(this, L('person'), box([393, 192, 49, 50])));
    const [lx, ly, , lh] = box([457, 191, 165, 49]);
    this.add_(this.add.text(lx, ly + lh / 2, 'ชื่อของคุณ', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 5 }).setOrigin(0, 0.5));
    this.nameInput = this.textBox(L('input-name'), box([351, 258, 554, 90]), [0.05, 0.13, 0.77, 0.74], {
      value: p.name, placeholder: 'ใส่ชื่อ', max: 12, size: 46, onEnter: () => this.create_(),
    });
    const edit = this.add_(new PlateButton(this, L('btn-edit'), box([829, 277, 59, 56]), () => {
      // straight into typing a new name over the old one
      this.nameInput?.focus();
      this.nameInput?.select();
    }));
    edit.put(fitted(this, L('ico-edit'), edit.w * 0.56, edit.h * 0.62), 0.5, 0.5);

    // you, in the outfit you will play in
    this.add_(filled(this, L('avatar-ring'), box([953, 264, 191, 110])));
    const [ax, ay, aw, ah] = box([945, 150, 190, 212]);
    const me = this.add_(this.add.image(ax + aw / 2, ay + ah, lookTexture(this, p.loadout)).setOrigin(0.5, 1));
    me.setScale(Math.min(aw / me.width, ah / me.height));
    this.tweens.add({ targets: me, scaleY: me.scaleY * 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const wardrobe = this.add_(new PlateButton(this, L('btn-wardrobe'), box([1160, 265, 211, 86]), () => this.toSetup()));
    wardrobe.put(fitted(this, L('ico-wardrobe'), wardrobe.w * 0.24, wardrobe.h * 0.54), 0.245, 0.5);
    const wt = this.add.text(0, 0, 'แต่งตัว', { fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 6 }).setOrigin(0, 0.5);
    wardrobe.put(fit(wt, wardrobe.w * 0.5, wardrobe.h * 0.6), 0.39, 0.48);

    // the two ways in: a new room, or a friend's room by code
    this.add_(filled(this, L('emphasis'), box([309, 401, 77, 88])));
    const create = this.add_(new PlateButton(this, L('btn-create'), box([319, 415, 502, 155]), () => this.create_(), [0, 0, 1, 1]));
    this.bigButton(create, L('ico-create'), [0.07, -0.08, 0.28, 0.9], 'สร้างห้องใหม่', [0.35, 0.59]);
    const [vx, vy, , vh] = box([852, 428, 4, 121]);
    this.add_(this.add.rectangle(vx, vy, 4, vh, DIVIDER, 0.75).setOrigin(0));
    const join = this.add_(new PlateButton(this, L('btn-join'), box([894, 416, 472, 153]), () => this.join(), [0, 0, 1, 1]));
    this.bigButton(join, L('ico-join'), [0.09, -0.04, 0.36, 0.9], 'เข้าห้อง', [0.48, 0.43]);

    const [hx, hy, hw] = box([430, 592, 824, 4]);
    this.add_(this.add.rectangle(hx, hy, hw, 4, DIVIDER, 0.75).setOrigin(0));
    const or = this.add_(filled(this, L('or'), box([810, 560, 88, 55])));
    this.add_(this.add.text(or.x, or.y, 'หรือ', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 4 }).setOrigin(0.5));

    this.add_(placed(this, L('people'), box([587, 618, 60, 46])));
    const [px, py, , ph] = box([659, 622, 416, 45]);
    this.add_(this.add.text(px, py + ph / 2, 'หรือเข้าห้องเพื่อนด้วยรหัส 6 หลัก', { fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 5 }).setOrigin(0, 0.5));
    this.codeInput = this.textBox(L('input-code'), box([549, 676, 574, 87]), [0.04, 0.13, 0.92, 0.74], {
      value: '', placeholder: '123456', max: 6, size: 54, numeric: true, onEnter: () => this.join(),
    });
    this.codeInput.style.letterSpacing = '0.12em';

    this.add_(placed(this, L('wifi'), box([568, 784, 42, 36])));
    const [wx, wy, , wh] = box([622, 783, 484, 36]);
    this.status = this.add_(this.add.text(wx, wy + wh / 2, '', { fontFamily: FONT, fontSize: '25px', color: '#ffffff' }).setOrigin(0, 0.5));
    this.statusIdle = WIFI_HINT;

    // the two fighters cheering either side, crates at their feet
    const fighter = (key: string, b: Box, delay: number) => {
      const [x, y, w, h] = box(b);
      const img = this.add_(this.add.image(x + w / 2, y + h, L(key)).setOrigin(0.5, 1));
      img.setScale(Math.min(w / img.width, h / img.height));
      this.tweens.add({ targets: img, scaleY: img.scaleY * 1.025, duration: 850, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay });
    };
    fighter('hero', [0, 443, 318, 409], 0);
    fighter('scout', [1375, 490, 297, 364], 300);
    this.add_(filled(this, L('emphasis'), box([273, 545, 72, 85])));
    this.add_(filled(this, L('emphasis'), box([1338, 562, 66, 77])).setFlipX(true));
    this.add_(filled(this, L('crate-left'), box([0, 800, 335, 141])));
    this.add_(filled(this, L('crate-right'), box([1320, 764, 352, 177])));
  }

  /**
   * Icon and title on one of the two big buttons. `icon` is [x, y, w, h] of the face (the
   * castle's flag pokes above it); `text` is [left, width] of the title's room.
   */
  private bigButton(c: PlateButton, icon: string, [ix, iy, iw, ih]: Box, title: string, [tx, tw]: [number, number]): void {
    c.put(fitted(this, icon, c.w * iw, c.h * ih), ix + iw / 2, iy + ih / 2);
    const t = this.add.text(0, 0, title, { fontFamily: FONT, fontSize: '62px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 9 }).setOrigin(0.5);
    c.put(fit(t, c.w * tw, c.h * 0.62), tx + tw / 2, 0.5);
  }

  private create_(): void {
    if (!net.connected) return this.say('ยังต่อเซิร์ฟเวอร์ไม่ได้');
    void this.enter(() => net.send({ t: 'create', ...this.profile() }));
  }

  private join(): void {
    const code = this.codeInput?.value.replace(/\D/g, '') ?? '';
    if (code.length !== 6) {
      this.codeInput?.focus();
      return this.say('ใส่รหัสห้อง 6 หลักในช่องด้านล่าง');
    }
    if (!net.connected) return this.say('ยังต่อเซิร์ฟเวอร์ไม่ได้');
    void this.enter(() => net.send({ t: 'join', code, ...this.profile() }));
  }

  /**
   * Create or join under the name in the box. The room server seats a signed-in player under
   * their account's name, so a new name is saved to the account first and the server told,
   * before `go` sends the request.
   */
  private async enter(go: () => void): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.rememberName();
    try {
      const typed = this.nameInput?.value.trim() ?? '';
      if (account.view && typed && typed !== account.view.displayName) {
        await account.save({ displayName: typed });
        await net.reauth();
      }
      if (this.live) go();
    } catch (err) {
      this.say(err instanceof Error ? err.message : 'บันทึกชื่อไม่ได้');
    } finally {
      this.busy = false;
    }
  }

  private toSetup(): void {
    this.rememberName();
    this.registry.set('setupMode', 'online');
    this.scene.start('setup');
  }

  /**
   * Inside a room, built to the room mockup: the two team frames with a slot per seat (a
   * fighter card, or an empty seat a bot fills with a "move here" button), the rules strip
   * (map list, format, bot skill: only the host can change them) and wardrobe / leave / start.
   * 1v1 matches the mockup; 2v2 stretches the frames for two shorter slots and moves the
   * strip down under them.
   */
  private roomView(): void {
    const room = net.room!;
    const me = room.players.find((p) => p.id === net.you);
    const host = room.hostId === net.you;
    const per = TEAM_SIZE[room.config.format];

    this.bg.setTexture('ui-room/bg');
    this.bg.setScale(Math.max(1920 / this.bg.width, 1080 / this.bg.height));
    this.add_(placed(this, R('crate'), rbox([-1, 764, 190, 183])));
    this.setTitle(`ห้อง ${room.code}`);

    // the line under the title, between two yellow marks
    this.statusIdle = room.playing ? 'กำลังเล่นอยู่ กดกลับเข้าเกมได้เลย' : 'ส่งรหัสห้องให้เพื่อน แล้วรอเข้าห้อง';
    const [hx, hy, hw, hh] = rbox([606, 159, 450, 45]);
    this.status = this.add_(this.rtext('', 37, '#ffffff', 6).setPosition(hx + hw / 2, hy + hh / 2).setOrigin(0.5));
    const [, , mw, mh] = rbox([0, 0, 52, 47]);
    this.marks = [
      this.add_(this.add.image(0, hy + hh / 2, R('mark')).setDisplaySize(mw, mh)),
      this.add_(this.add.image(0, hy + hh / 2, R('mark')).setDisplaySize(mw, mh).setFlipX(true)),
    ];

    // team frames: 1v1 is the mockup; 2v2 starts a little higher and fits two shorter slots
    const top = per === 1 ? 255 : 246;
    const slotH = per === 1 ? 162 : 124;
    const gap = 10;
    const panelH = 76 + per * slotH + (per - 1) * gap + 44;
    ([0, 1] as const).forEach((team) => {
      const dx = team === 0 ? 0 : 721;
      const side = team === 0 ? 'blue' : 'red';
      const [px, py, pw, ph] = rbox([125 + dx, top, 709, panelH]);
      const tex = this.textures.getFrame(R(`panel-${side}`));
      const s = pw / tex.width;
      this.add_(this.add.nineslice(px, py, R(`panel-${side}`), undefined, tex.width, ph / s, 80, 80, 75, 55).setOrigin(0).setScale(s));
      this.add_(filled(this, R(`tab-${side}`), rbox([158 + dx, top - 21, 372, 69])));
      this.add_(placed(this, R(`flag-${side}`), rbox([186 + dx, top - 41, 94, 96])));
      const [tx, ty, tw, th] = rbox([294 + dx, top - 15, 205, 51]);
      const name = this.rtext(team === 0 ? 'ทีม น้ำเงิน' : 'ทีม แดง', 46, '#ffffff', 7).setPosition(tx + tw / 2, ty + th / 2).setOrigin(0.5);
      this.add_(fit(name, tw + 30, th));

      const members = room.players.filter((p) => p.team === team);
      let offered = false;
      for (let i = 0; i < per; i++) {
        const b = rbox([158 + dx, top + 76 + i * (slotH + gap), 644, slotH]);
        this.add_(filled(this, R(`slot-${side}`), b));
        const p = members[i];
        if (p) {
          this.fighterSlot(b, p, room.hostId);
        } else {
          // one "move here" per team, on its first open seat
          const canMove: boolean = !!me && me.team !== team && !room.playing && !offered;
          offered ||= canMove;
          this.emptySlot(b, `ว่าง: บอท${DIFF_LABEL[room.config.difficulty]}จะเล่นแทน`, canMove ? () => net.send({ t: 'team', team }) : null);
        }
      }
    });

    this.rules(room.config, host && !room.playing, top + panelH + 21 - 558);

    // wardrobe, leave, start
    const wardrobe = this.add_(new PlateButton(this, R('btn-action'), rbox([314, 779, 331, 99]), () => this.toSetup(), [0, 0, 1, 1]));
    this.plateLabel(wardrobe, R('gear'), [0.12, 0.2, 0.17, 0.6], 'แต่งตัว/ไอเท็ม', [0.33, 0.61], 34);
    wardrobe.setEnabled(!room.playing);
    const leave = this.add_(new PlateButton(this, R('btn-leave'), rbox([686, 779, 333, 99]), () => {
      net.leave();
      this.render();
    }, [0, 0, 1, 1]));
    this.plateLabel(leave, R('exit'), [0.13, 0.2, 0.18, 0.6], 'ออกจากห้อง', [0.34, 0.59], 36);
    const start = this.add_(new PlateButton(this, R('btn-start'), rbox([1050, 758, 484, 133]), () => {
      net.send({ t: room.playing ? 'resume' : 'start' });
    }, [0, 0, 1, 1]));
    const startText = room.playing ? 'กลับเข้าเกม' : host ? 'เริ่มเกม!' : 'รอหัวห้องกดเริ่ม…';
    this.plateLabel(start, R('gamepad'), [0.14, 0.18, 0.22, 0.67], startText, [0.38, 0.55], 62);
    start.setEnabled(room.playing || host);
    if (room.playing || host) start.glint(600);
  }

  /** Text in the room's style: bold, white, the navy outline. */
  private rtext(str: string, size: number, color = '#ffffff', stroke = 5): Phaser.GameObjects.Text {
    return this.add.text(0, 0, str, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: STROKE, strokeThickness: stroke });
  }

  /** An icon and a label on a plate button: `icon` is [x, y, w, h] and `text` [left, width], fractions of the plate. */
  private plateLabel(b: PlateButton, icon: string, [ix, iy, iw, ih]: Box, str: string, [tx, tw]: [number, number], size: number): void {
    b.put(fitted(this, icon, b.w * iw, b.h * ih), ix + iw / 2, iy + ih / 2);
    const t = this.rtext(str, size, '#ffffff', Math.round(size / 6)).setOrigin(0.5);
    b.put(fit(t, b.w * tw, b.h * 0.66), tx + tw / 2, 0.5);
  }

  /**
   * A seated player: portrait, name (crown for the host), a badge with their weapon and one
   * saying host / player / you / dropped. Sizes follow the slot's height (u), so the shorter
   * 2v2 slots get the same card, smaller.
   */
  private fighterSlot([x, y, , h]: Box, p: PlayerView, hostId: number): void {
    const u = h / 162;
    const at = (bx: number, by: number, bw: number, bh: number): Box => [x + bx * u, y + by * u, bw * u, bh * u];
    this.add_(filled(this, R('avatar'), at(22, 12, 137, 136)));
    this.add_(this.portrait(lookTexture(this, p.loadout), at(31, 17, 119, 122))).setAlpha(p.connected ? 1 : 0.45);

    const [nx, ny, nw, nh] = at(178, 18, 300, 52);
    const name = this.add_(fit(this.rtext(p.name, Math.round(44 * u), '#ffffff', 6).setPosition(nx, ny + nh / 2).setOrigin(0, 0.5), nw, nh));
    if (p.id === hostId) {
      const [, , cw, ch] = at(0, 0, 52, 37);
      this.add_(placed(this, R('crown'), [nx + name.displayWidth + 10 * u, ny + (nh - ch) / 2, cw, ch]));
    }

    // badges grow with their text
    const badge = (bx: number, icon: string, str: string, color: string): number => {
      const [, by, , bh] = at(0, 78, 0, 49);
      const t = this.rtext(str, Math.round(27 * u), color, 0).setOrigin(0, 0.5);
      const w = 52 * u + t.width + 16 * u;
      this.add_(filled(this, R('badge'), [bx, by, w, bh]));
      this.add_(placed(this, R(icon), [bx + 15 * u, by + bh * 0.22, 28 * u, bh * 0.56]));
      this.add_(t.setPosition(bx + 50 * u, by + bh / 2));
      this.children.bringToTop(t); // made first to measure it: lift it over its plate
      return bx + w;
    };
    const you = p.id === net.you;
    const tags = [p.id === hostId ? 'หัวห้อง' : 'ผู้เล่น', you ? 'คุณ' : '', p.connected ? '' : 'หลุด'].filter(Boolean).join(' · ');
    const end = badge(x + 179 * u, 'star', WEAPONS[p.loadout.weapon].name, '#cfdef6');
    badge(end + 19 * u, 'pin', tags, p.connected ? '#cfdef6' : '#ff9a9a');
  }

  /** An open seat: the people icon, who plays it, and (when you can) a button to move here. */
  private emptySlot([x, y, w, h]: Box, hint: string, move: (() => void) | null): void {
    const u = h / 162;
    const lift = move ? 0 : 0.12; // without the button the icon and hint sit lower, in the middle
    const [, , iw, ih] = rbox([0, 0, 98, 48]);
    this.add_(placed(this, R('empty'), [x + w / 2 - (iw * u) / 2, y + h * (0.07 + lift), iw * u, ih * u]));
    const t = this.rtext(hint, Math.round(29 * u), '#9996a9', 0).setPosition(x + w / 2, y + h * (0.5 + lift)).setOrigin(0.5);
    this.add_(fit(t, w * 0.9, h * 0.25));
    if (!move) return;
    const bw = w * 0.5;
    const bh = rbox([0, 0, 0, 71])[3] * u;
    const b = this.add_(new PlateButton(this, R('btn-action'), [x + (w - bw) / 2, y + h * 0.65, bw, bh], move, [0, 0, 1, 1]));
    this.plateLabel(b, R('move'), [0.22, 0.16, 0.15, 0.66], 'ย้ายมาทันที', [0.4, 0.45], Math.round(34 * u));
  }

  /** The head and chest of a fighter's look, cropped into a box. */
  private portrait(key: string, [x, y, w, h]: Box): Phaser.GameObjects.Image {
    const img = this.add.image(0, 0, key).setOrigin(0, 0);
    const W = img.width;
    const fx = 0.1;
    const fw = 0.8;
    const s = w / (fw * W);
    const cy = img.height * 0.01;
    return img.setCrop(fx * W, cy, fw * W, h / s).setScale(s).setPosition(x - fx * W * s, y - cy * s);
  }

  /** Keep the two yellow marks either side of the status line, whatever it says. */
  private placeMarks(): void {
    if (!this.marks || !this.status) return;
    const half = this.status.displayWidth / 2 + this.marks[0].displayWidth / 2 + 14;
    this.marks[0].setX(this.status.x - half);
    this.marks[1].setX(this.status.x + half);
  }

  /** The rules strip, `dy` below where the mockup has it: map dropdown, format, bot skill. */
  private rules(c: RoomConfig, host: boolean, dy: number): void {
    const set = (patch: Partial<RoomConfig>) => net.send({ t: 'config', config: { ...c, ...patch } });
    const at = (b: Box): Box => rbox([b[0], b[1] + dy, b[2], b[3]]);
    this.add_(filled(this, R('bar'), at([124, 558, 1434, 97])));
    for (const x of [604, 1041]) this.add_(filled(this, R('divider'), at([x, 578, 4, 54])));
    const title = (str: string, b: Box) => {
      const [x, y, w, h] = at(b);
      this.add_(fit(this.rtext(str, 31, '#ffffff', 5).setPosition(x, y + h / 2).setOrigin(0, 0.5), w, h));
    };
    title('ด่าน', [160, 584, 55, 41]);
    title('แบบ', [629, 584, 52, 41]);
    title('ความเก่งบอท', [1065, 584, 132, 41]);

    const option = (b: Box, str: string, on: boolean, pick: () => void) => {
      const o = this.add_(new PlateButton(this, R(on ? 'option-on' : 'option'), at(b), () => {
        if (!on) pick();
      }, [0, 0, 1, 1]));
      o.put(fit(this.rtext(str, 33, '#ffffff', 5).setOrigin(0.5), o.w * 0.8, o.h * 0.7), 0.5, 0.5);
      o.setEnabled(host || on);
      // the chosen one stays bright for guests too; it just ignores taps
      if (!host) o.setAlpha(on ? 1 : 0.55);
    };
    // the mockup has three formats; the room server plays 1v1 and 2v2, so two wider buttons fill the row
    FORMATS.forEach((f, i) => option([696 + i * 164, 576, 160, 59], f, c.format === f, () => set({ format: f })));
    DIFFICULTIES.forEach((d, i) => option([[1207, 1317, 1427][i], 576, 111, 59], DIFF_LABEL[d], c.difficulty === d, () => set({ difficulty: d })));

    // the map: a picture-and-name box; the host taps it for the list
    const mapBox = at([238, 574, 346, 64]);
    const map = this.add_(new PlateButton(this, R('map'), mapBox, () => this.mapList(mapBox, c.map, (m) => set({ map: m })), [0, 0, 1, 1]));
    this.mapFace(map, c.map, host);
    map.setEnabled(host);
    if (!host) map.setAlpha(1);
  }

  /** Thumbnail, name and (for the host) the down arrow on a map plate. */
  private mapFace(b: PlateButton, id: MapId, arrow: boolean): void {
    const thumb = this.add.image(0, 0, R(`map-${id}`)).setOrigin(0, 0);
    // cover the left 36% of the plate: crop the picture to that shape
    const tw = b.w * 0.36;
    const th = b.h * 0.94;
    const s = Math.max(tw / thumb.width, th / thumb.height);
    const cw = tw / s;
    const ch = th / s;
    thumb.setCrop((thumb.width - cw) / 2, (thumb.height - ch) / 2, cw, ch).setScale(s);
    b.putAt(thumb, -((thumb.width - cw) / 2) * s + b.w * 0.01, -((thumb.height - ch) / 2) * s + b.h * 0.03);
    b.put(fit(this.rtext(MAPS[id].name, 31, '#ffffff', 5).setOrigin(0.5), b.w * 0.45, b.h * 0.76), 0.615, 0.5);
    if (arrow) b.put(fitted(this, R('down'), b.w * 0.09, b.h * 0.44), 0.915, 0.5);
  }

  /** The host's map list, opening under the map box; a tap anywhere else closes it. */
  private mapList([x, y, w, h]: Box, current: MapId, pick: (m: MapId) => void): void {
    const parts: Phaser.GameObjects.GameObject[] = [];
    const close = () => parts.forEach((p) => p.destroy());
    const shade = this.add_(this.add.zone(960, 540, 1920, 1080).setInteractive());
    shade.on('pointerup', close);
    parts.push(shade);
    MAP_IDS.forEach((m, i) => {
      const row = this.add_(new PlateButton(this, R('map'), [x, y + h + 8 + i * (h + 6), w, h], () => {
        close();
        if (m !== current) pick(m);
      }, [0, 0, 1, 1]));
      if (m === current) row.base.setTint(0xfff1a8);
      this.mapFace(row, m, false);
      parts.push(row);
    });
  }
}

/** Inputs over the painted boxes: no box of their own, white text, the mockup's grey placeholder. Added once. */
function inputStyle(): void {
  if (document.getElementById('bb-input-style')) return;
  const style = document.createElement('style');
  style.id = 'bb-input-style';
  style.textContent = '.bb-input{box-sizing:border-box;padding:0 8px;border:0;outline:none;background:transparent;color:#fff;'
    + 'text-shadow:0 2px 0 #091024;caret-color:#ffd166}.bb-input::placeholder{color:#8d8d95;text-shadow:none}';
  document.head.append(style);
}
