import Phaser from 'phaser';
import { ART_SCALE, lookRes, lookTexture } from '../art/chibi';
import { Difficulty } from '../core/BotAI';
import { WEAPONS } from '../core/data';
import { MAPS, MAP_IDS } from '../core/Maps';
import { account } from '../net/account';
import { net } from '../net/NetClient';
import { OnlineFormat, Profile, RoomConfig, ServerMsg, TEAM_SIZE } from '../net/protocol';
import { Box, PlateButton, STROKE, filled, fitted, mockupBox, placed, walletBar } from '../ui/plates';
import { Button, FONT, INK, TEAM_COLORS, fit, label } from '../ui/widgets';
import { DIFF_LABEL, loadSetup } from './setup';

const NAME_KEY = 'crater-clash:name';
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const FORMATS: OnlineFormat[] = ['1v1', '2v2'];

/** Where each piece sits in the designer's 1672x941 mockup (new_ui/black-boom-lobby-parts/layout.json). */
const box = (b: Box): Box => mockupBox(b, 1672);
const L = (name: string) => `ui-lobby/${name}`;
const WIFI_HINT = 'เล่นด้วยกันผ่าน Wi-Fi วงเดียวกัน หรืออินเทอร์เน็ตก็ได้';
const DIVIDER = 0x8991b6;

/**
 * Friend rooms: create or join by 6-digit code, pick teams, host picks the rules.
 * The entry view is built to the painted mockup (name box, wardrobe, create / join, code
 * box, two fighters either side); the room view keeps its team cards on the same arena.
 * Back, title plate and wallet are built once; render() rebuilds the view under them.
 */
export default class LobbyScene extends Phaser.Scene {
  private ui: Phaser.GameObjects.GameObject[] = [];
  /** The line that says whether the server is reachable (wifi hint, or the room's subtitle). */
  private status: Phaser.GameObjects.Text | null = null;
  private statusIdle = '';
  private title!: Phaser.GameObjects.Text;
  private titleBox!: Box;
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
    const bg = this.add.image(960, 540, L('bg'));
    bg.setScale(Math.max(1920 / bg.width, 1080 / bg.height));
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
    const back = new PlateButton(this, 'ui-ranked/btn-back', box([24, 18, 94, 84]), () => this.toMenu());
    back.put(fitted(this, 'ui-ranked/ico-back', back.w * 0.5, back.h * 0.5), 0.5, 0.5);
    filled(this, L('header'), box([143, 27, 675, 95]));
    placed(this, L('logo'), box([139, 17, 173, 92]));
    const [dx, dy, , dh] = box([328, 50, 3, 40]);
    this.add.rectangle(dx, dy, 3, dh, DIVIDER, 0.75).setOrigin(0);
    placed(this, L('people'), box([352, 41, 81, 58]));
    this.titleBox = box([452, 35, 330, 68]);
    const [tx, ty, , th] = this.titleBox;
    this.title = this.add.text(tx, ty + th / 2, '', {
      fontFamily: FONT, fontSize: '64px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 8,
    }).setOrigin(0, 0.5);
    walletBar(this);
  }

  private setTitle(t: string): void {
    this.title.setText(t);
    fit(this.title.setScale(1), this.titleBox[2], this.titleBox[3]);
  }

  /** Connected: the view's own line. Not yet: say so, and after a few seconds say the server seems down. */
  private showStatus(): void {
    this.failTimer?.remove();
    this.failTimer = null;
    const set = (t: string, color: string) => this.status?.setText(t).setColor(color);
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

  private roomView(): void {
    const room = net.room!;
    const me = room.players.find((p) => p.id === net.you);
    const host = room.hostId === net.you;
    const per = TEAM_SIZE[room.config.format];

    // the code goes on the title plate, where it is easy to read out to a friend
    this.setTitle(`ห้อง ${room.code.replace(/(\d{3})(\d{3})/, '$1 $2')}`);
    this.statusIdle = room.playing ? 'กำลังเล่นอยู่' : 'ส่งรหัสห้องให้เพื่อน แล้วรอเข้าห้อง';
    this.status = this.add_(label(this, 960, 190, '', 28).setOrigin(0.5, 0));

    // teams
    [0, 1].forEach((team) => {
      const cx = team === 0 ? 560 : 1360;
      const g = this.add_(this.add.graphics());
      g.fillStyle(INK, 0.85);
      g.fillRoundedRect(cx - 360, 250, 720, 120 + per * 150, 26);
      g.lineStyle(5, TEAM_COLORS[team], 1);
      g.strokeRoundedRect(cx - 360, 250, 720, 120 + per * 150, 26);
      this.add_(label(this, cx, 266, `ทีม ${team === 0 ? 'น้ำเงิน' : 'แดง'}`, 34, team === 0 ? '#8ab4ff' : '#ff9a9a').setOrigin(0.5, 0));
      const members = room.players.filter((p) => p.team === team);
      for (let i = 0; i < per; i++) {
        const y = 330 + i * 150;
        const p = members[i];
        if (!p) {
          this.add_(label(this, cx, y + 60, `ว่าง: บอท${DIFF_LABEL[room.config.difficulty]}จะเล่นแทน`, 26, '#8899aa').setOrigin(0.5));
          continue;
        }
        this.add_(this.add.image(cx - 270, y + 130, lookTexture(this, p.loadout)).setOrigin(0.5, 1).setScale(ART_SCALE * 1.15 * lookRes()).setFlipX(team === 1));
        const tags = [p.id === room.hostId ? 'หัวห้อง' : '', p.id === net.you ? 'คุณ' : '', p.connected ? '' : 'หลุด'].filter(Boolean).join(' · ');
        this.add_(label(this, cx - 180, y + 24, p.name, 38, p.id === net.you ? '#ffd166' : '#ffffff'));
        this.add_(label(this, cx - 180, y + 76, `${WEAPONS[p.loadout.weapon].name}${tags ? `  ·  ${tags}` : ''}`, 24, p.connected ? '#cfd8ff' : '#ff8787'));
      }
      if (me && me.team !== team && !room.playing && members.length < per) {
        this.add_(new Button(this, cx, 330 + per * 150 + 10, 280, 60, 'ย้ายมาทีมนี้', { size: 26, onClick: () => net.send({ t: 'team', team }) }));
      }
    });

    // rules
    const y0 = 330 + per * 150 + 90;
    // a dark strip so the small labels read on the bright arena
    const strip = this.add_(this.add.graphics());
    strip.fillStyle(INK, 0.85);
    strip.fillRoundedRect(170, y0 - 42, 1580, 84, 24);
    this.rules(room.config, host && !room.playing, y0);

    // actions
    this.add_(new Button(this, 760, 990, 300, 90, 'แต่งตัว/ไอเท็ม', { size: 30, onClick: () => this.toSetup() }).setEnabled(!room.playing));
    if (room.playing) {
      this.add_(new Button(this, 1640, 985, 440, 110, 'กลับเข้าเกม', { fill: 0x2f9e44, size: 44, onClick: () => net.send({ t: 'resume' }) }));
    } else if (host) {
      this.add_(new Button(this, 1640, 985, 440, 110, 'เริ่มเกม!', { fill: 0x2f9e44, size: 48, onClick: () => net.send({ t: 'start' }) }));
    } else {
      this.add_(label(this, 1640, 985, 'รอหัวห้องกดเริ่ม…', 34).setOrigin(0.5));
    }
    this.add_(new Button(this, 1180, 990, 260, 90, 'ออกจากห้อง', {
      size: 30, fill: 0x9b2c2c, onClick: () => {
        net.leave();
        this.render();
      },
    }));
  }

  private rules(c: RoomConfig, host: boolean, y: number): void {
    const set = (patch: Partial<RoomConfig>) => net.send({ t: 'config', config: { ...c, ...patch } });
    const row = (x: number, title: string, opts: { text: string; on: boolean; pick: () => void }[], w: number) => {
      this.add_(label(this, x, y, title, 26, '#cfd8ff').setOrigin(0, 0.5));
      opts.forEach((o, i) => {
        const b = this.add_(new Button(this, x + 130 + w / 2 + i * (w + 12), y, w, 56, o.text, { size: 24, onClick: o.pick }));
        b.setSelected(o.on).setEnabled(host || o.on);
      });
    };
    row(200, 'ด่าน', MAP_IDS.map((m) => ({ text: MAPS[m].name, on: c.map === m, pick: () => set({ map: m }) })), 170);
    row(950, 'แบบ', FORMATS.map((f) => ({ text: f, on: c.format === f, pick: () => set({ format: f }) })), 110);
    row(1340, 'บอท', DIFFICULTIES.map((d) => ({ text: DIFF_LABEL[d], on: c.difficulty === d, pick: () => set({ difficulty: d }) })), 100);
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
