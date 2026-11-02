import Phaser from 'phaser';
import { ART_SCALE, lookTexture } from '../art/chibi';
import { Difficulty } from '../core/BotAI';
import { WEAPONS } from '../core/data';
import { MAPS, MAP_IDS } from '../core/Maps';
import { net } from '../net/NetClient';
import { OnlineFormat, Profile, RoomConfig, ServerMsg, TEAM_SIZE } from '../net/protocol';
import { Button, FONT, INK, TEAM_COLORS, label } from '../ui/widgets';
import { menuBackdrop } from './backdrop';
import { DIFF_LABEL, loadSetup } from './setup';

const NAME_KEY = 'crater-clash:name';
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const FORMATS: OnlineFormat[] = ['1v1', '2v2'];

/** Friend rooms: create or join by 6-digit code, pick teams, host picks the rules. */
export default class LobbyScene extends Phaser.Scene {
  private ui: Phaser.GameObjects.GameObject[] = [];
  private status!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private handler = (msg: ServerMsg) => this.onNet(msg);
  private statusHandler = () => this.render();
  private nameInput: HTMLInputElement | null = null;
  private codeInput: HTMLInputElement | null = null;
  private failTimer: Phaser.Time.TimerEvent | null = null;
  private live = false;

  constructor() {
    super('lobby');
  }

  create(): void {
    menuBackdrop(this);
    const shade = this.add.graphics();
    shade.fillStyle(0x10162a, 0.6);
    shade.fillRect(0, 0, 1920, 1080);
    label(this, 60, 30, 'เล่นกับเพื่อน', 56, '#ffd166');
    this.status = label(this, 1860, 44, '', 24).setOrigin(1, 0);
    this.hint = label(this, 960, 1040, '', 28, '#ffd166').setOrigin(0.5);

    net.on('any', this.handler);
    net.on('status', this.statusHandler);
    this.live = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
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

  private onNet(msg: ServerMsg): void {
    if (msg.t === 'match') {
      this.scene.start('battle', { online: true });
      return;
    }
    if (msg.t === 'error') this.say(msg.msg);
    if (msg.t === 'room' || msg.t === 'left' || msg.t === 'joined') this.render();
  }

  private profile(): Profile {
    const s = loadSetup(this.registry);
    return { name: this.nameInput?.value.trim() || this.savedName(), loadout: s.loadout, items: s.items };
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
    this.failTimer?.remove();
    this.failTimer = null;
    if (net.connected) this.status.setText('ออนไลน์').setColor('#7CFC9A');
    else {
      this.status.setText('กำลังต่อเซิร์ฟเวอร์…').setColor('#ffd166');
      // Still nothing after a few seconds: the server is probably not running.
      this.failTimer = this.time.delayedCall(3000, () => {
        if (!net.connected) this.status.setText('ต่อเซิร์ฟเวอร์ไม่ได้ (เปิด npm run server หรือยัง?)').setColor('#ff8787');
      });
    }
    this.clear();
    if (net.room) this.roomView();
    else if (!net.inRoom) this.entryView();
    this.add_(new Button(this, 200, 990, 260, 90, '← เมนู', { size: 34, onClick: () => this.toMenu() }));
  }

  private toMenu(): void {
    if (net.room) net.leave();
    this.scene.start('menu');
  }

  private textBox(x: number, y: number, w: number, value: string, placeholder: string, max: number, numeric = false): HTMLInputElement {
    const el = document.createElement('input');
    el.value = value;
    el.placeholder = placeholder;
    el.maxLength = max;
    if (numeric) el.inputMode = 'numeric';
    el.style.cssText = `width:${w}px;height:84px;font:600 44px ${FONT};text-align:center;border-radius:18px;`
      + 'border:4px solid #ffd166;background:#1b2030;color:#fff;outline:none;';
    this.add_(this.add.dom(x, y, el));
    return el;
  }

  private entryView(): void {
    const p = this.profile();
    const card = this.add_(this.add.graphics());
    card.fillStyle(INK, 0.85);
    card.fillRoundedRect(360, 150, 1200, 760, 32);

    this.add_(label(this, 960, 190, 'ชื่อของคุณ', 32).setOrigin(0.5, 0));
    this.nameInput = this.textBox(960, 290, 520, p.name, 'ใส่ชื่อ', 12);
    this.add_(this.add.image(1420, 330, lookTexture(this, p.loadout)).setOrigin(0.5, 1).setScale(ART_SCALE * 1.6));
    this.add_(new Button(this, 1420, 380, 230, 60, 'แต่งตัว', { size: 26, onClick: () => this.toSetup() }));

    this.add_(new Button(this, 960, 460, 560, 110, 'สร้างห้องใหม่', {
      fill: 0x2f9e44, size: 44,
      onClick: () => {
        if (!net.connected) return this.say('ยังต่อเซิร์ฟเวอร์ไม่ได้');
        this.rememberName();
        net.send({ t: 'create', ...this.profile() });
      },
    }));

    this.add_(label(this, 960, 570, 'หรือเข้าห้องเพื่อนด้วยรหัส 6 หลัก', 30).setOrigin(0.5, 0));
    this.codeInput = this.textBox(830, 700, 400, '', '123456', 6, true);
    this.add_(new Button(this, 1250, 700, 300, 96, 'เข้าห้อง', {
      fill: 0x4c6ef5, size: 40,
      onClick: () => {
        const code = this.codeInput?.value.replace(/\D/g, '') ?? '';
        if (code.length !== 6) return this.say('รหัสห้องต้องมี 6 หลัก');
        if (!net.connected) return this.say('ยังต่อเซิร์ฟเวอร์ไม่ได้');
        this.rememberName();
        net.send({ t: 'join', code, ...this.profile() });
      },
    }));
    this.add_(label(this, 960, 810, 'เพื่อนต้องต่อ Wi-Fi วงเดียวกัน และเปิดเกมจากที่อยู่เดียวกับคุณ', 22, '#cfd8ff').setOrigin(0.5, 0));
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

    this.add_(label(this, 960, 40, 'รหัสห้อง', 28).setOrigin(0.5, 0));
    this.add_(label(this, 960, 76, room.code.replace(/(\d{3})(\d{3})/, '$1 $2'), 96, '#ffd166').setOrigin(0.5, 0));
    this.add_(label(this, 960, 190, room.playing ? 'กำลังเล่นอยู่' : 'ส่งรหัสนี้ให้เพื่อน แล้วรอเข้าห้อง', 24, '#cfd8ff').setOrigin(0.5, 0));

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
        this.add_(this.add.image(cx - 270, y + 130, lookTexture(this, p.loadout)).setOrigin(0.5, 1).setScale(ART_SCALE * 1.15).setFlipX(team === 1));
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
