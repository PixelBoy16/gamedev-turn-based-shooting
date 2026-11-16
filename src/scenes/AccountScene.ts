import Phaser from 'phaser';
import { lookTexture } from '../art/chibi';
import { account } from '../net/account';
import { LeaderRow } from '../net/protocol';
import { FONT, fit, label } from '../ui/widgets';
import { Box, PlateButton, STROKE, filled, fitted, mockupBox, placed } from '../ui/plates';
import { loadSetup, syncSetup } from './setup';

// Built from the designer's painted mockup (new_ui/black-boom-account-parts 2, 1672×941):
// the account card on the left (name, stats, keeping a guest account / signing in / signed in)
// and the leaderboard on the right.

const box = (b: Box) => mockupBox(b, 1672);
const A = (name: string) => `ui-account/${name}`;
const K = 1920 / 1672;
const TOP = 10;

type Mode = 'guest' | 'login' | 'member';

/** Name, stats, claiming a guest account with a username, signing in elsewhere, and the leaderboard. */
export default class AccountScene extends Phaser.Scene {
  private ui: Phaser.GameObjects.GameObject[] = [];
  private hint!: Phaser.GameObjects.Text;
  private board: LeaderRow[] | null = null;
  private boardFailed = false;
  private loginMode = false;
  private busy = false;
  /** What was typed, kept when the card is redrawn. */
  private typed: Record<string, string> = {};
  private fields: Record<string, HTMLInputElement> = {};

  constructor() {
    super('account');
  }

  create(): void {
    this.board = null;
    this.boardFailed = false;
    this.loginMode = false;
    this.typed = {};
    this.fields = {};
    // the battle's key bindings (W, A, S, D, E, R...) stay captured game-wide and would eat letters typed here
    this.input.keyboard?.clearCaptures();
    placeholderStyle();
    this.add.image(960, 540, A('bg')).setDisplaySize(1920, 1080);
    this.chrome();
    filled(this, A('panel'), box([112, 132, 876, 688]));
    filled(this, A('board'), box([1027, 132, 583, 688]));
    filled(this, A('title-base'), box([1058, 170, 516, 98]));
    filled(this, A('laurels'), box([1084, 155, 458, 107]));
    this.inBox(this.text('อันดับคะแนนสูงสุด', 39, '#fff1ac', 4), [1140, 183, 358, 59], 'center');
    placed(this, A('crate'), box([-15, 827, 231, 213])).setDepth(TOP);
    placed(this, A('ammo-crate'), box([693, 825, 337, 267])).setDepth(TOP);
    this.hint = label(this, 960, 1000, '', 34, '#ffd166').setOrigin(0.5).setDepth(TOP + 1)
      .setStroke(STROKE, 8).setFontStyle('bold');

    const stop = account.onChange(() => this.render());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      stop();
      this.ui = [];
      this.fields = {};
    });
    void account.ensure().then(() => this.render());
    account.leaderboard().then((rows) => {
      this.board = rows;
      this.render();
    }).catch(() => {
      this.boardFailed = true;
      this.render();
    });
    this.render();
  }

  private chrome(): void {
    filled(this, A('header'), box([29, 20, 754, 95]));
    filled(this, A('header-divider'), box([156, 41, 4, 45]));
    filled(this, A('header-divider'), box([403, 41, 4, 45]));
    placed(this, A('logo'), box([171, 6, 212, 94]));
    this.inBox(this.text('บัญชีของฉัน', 47, '#ffe158', 5), [426, 36, 282, 55], 'center');
    const back = new PlateButton(this, A('btn-back'), box([23, 20, 120, 94]), () => this.scene.start('menu'));
    back.put(fitted(this, A('ico-back'), back.w * 0.5, back.h * 0.6), 0.5, 0.5);
  }

  private text(str: string, size: number, color = '#ffffff', stroke = 3): Phaser.GameObjects.Text {
    return this.add.text(0, 0, str, {
      fontFamily: FONT, fontSize: `${Math.round(size * K)}px`, fontStyle: 'bold', color,
      stroke: STROKE, strokeThickness: Math.round(stroke * K * 1.4), padding: { x: 4, y: 6 },
    });
  }

  /** Put `t` inside a mockup box, vertically centred, shrunk to fit. */
  private inBox<T extends Phaser.GameObjects.Text>(t: T, b: Box, align: 'start' | 'center' = 'start'): T {
    const [x, y, w, h] = box(b);
    t.setOrigin(align === 'center' ? 0.5 : 0, 0.5).setPosition(align === 'center' ? x + w / 2 : x, y + h / 2);
    return fit(t, w, h * 1.25);
  }

  private say(msg: string): void {
    this.hint.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.hint);
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 2800, duration: 400 });
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.ui.push(o);
    return o;
  }

  /** Run a server call with the buttons locked; show its error in Thai. */
  private async act(fn: () => Promise<void>, done: string): Promise<void> {
    if (this.busy) return;
    if (!account.view) {
      this.say('ต้องต่อเซิร์ฟเวอร์ก่อน ตอนนี้เล่นกับบอทได้ตามปกติ');
      return;
    }
    this.busy = true;
    try {
      await fn();
      this.say(done);
    } catch (err) {
      this.say((err as Error).message || 'ต่อเซิร์ฟเวอร์ไม่ได้');
    } finally {
      this.busy = false;
    }
  }

  /** A text box over a painted plate: transparent, the plate shows through. */
  private field(id: string, b: Box, placeholder: string, opts: { password?: boolean; max?: number; size?: number; value?: string; readOnly?: boolean; onEnter?: () => void } = {}): HTMLInputElement {
    const [x, y, w, h] = box(b);
    const el = document.createElement('input');
    el.className = 'bb-field';
    el.value = (opts.readOnly ? undefined : this.typed[id]) ?? opts.value ?? '';
    el.placeholder = placeholder;
    el.maxLength = opts.max ?? 20;
    el.readOnly = !!opts.readOnly;
    if (opts.password) {
      el.type = 'password';
      el.autocomplete = 'current-password';
    } else {
      el.autocapitalize = 'off';
      el.spellcheck = false;
    }
    el.style.cssText = `width:${w}px;height:${h}px;font:700 ${Math.round((opts.size ?? 30) * K)}px ${FONT};padding:0;margin:0;`
      + 'border:none;background:transparent;color:#fff;outline:none;caret-color:#ffd166;'
      + 'text-shadow:0 0 3px #091024,0 2px 0 #091024,2px 0 0 #091024,-2px 0 0 #091024,0 -2px 0 #091024;';
    el.addEventListener('input', () => (this.typed[id] = el.value));
    if (opts.onEnter) el.addEventListener('keydown', (e) => e.key === 'Enter' && opts.onEnter?.());
    this.keep(this.add.dom(x, y + h / 2, el).setOrigin(0, 0.5));
    this.fields[id] = el;
    return el;
  }

  private button(key: string, b: Box, str: string, size: number, onClick: () => void): PlateButton {
    const btn = this.keep(new PlateButton(this, A(key), box(b), onClick));
    btn.put(fit(this.text(str, size, '#ffffff', 4).setOrigin(0.5), btn.w * 0.82, btn.h * 0.66), 0.5, 0.5);
    return btn;
  }

  private render(): void {
    if (!this.sys.isActive()) return;
    for (const o of this.ui) o.destroy();
    this.ui = [];
    this.fields = {};
    this.card();
    this.leaderboard();
  }

  private card(): void {
    const me = account.view;
    // the player's face, in the look they wear, inside the gold frame
    this.keep(filled(this, A('avatar-fill'), box([172, 174, 137, 132])));
    this.keep(this.portrait(box([176, 176, 129, 127])));
    this.keep(filled(this, A('frame'), box([169, 169, 142, 138])));
    this.keep(placed(this, A('emphasis'), box([307, 157, 41, 44])));

    this.keep(this.inBox(this.text('ชื่อที่แสดงในเกม', 35), [360, 168, 243, 43]));
    this.keep(filled(this, A('name-input'), box([329, 220, 400, 76])));
    const saveName = () => this.act(async () => {
      await account.save({ displayName: this.fields.name?.value ?? '' });
      delete this.typed.name;
    }, 'บันทึกชื่อแล้ว');
    this.field('name', [357, 229, 344, 58], 'ชื่อ', { max: 12, size: 35, value: me?.displayName ?? '', onEnter: saveName });
    this.button('btn-save', [746, 219, 201, 80], 'บันทึกชื่อ', 31, saveName);

    this.keep(filled(this, A('stats'), box([167, 316, 769, 56])));
    this.keep(placed(this, A('crown'), box([201, 323, 56, 40])));
    const winRate = me?.played ? Math.round((me.wins / me.played) * 100) : 0;
    const stats = me
      ? `คะแนนจัดอันดับ ${me.rating} (${me.rankedPlayed} เกม) · เล่นทั้งหมด ${me.played} · ชนะ ${me.wins} (${winRate}%)`
      : 'ต่อเซิร์ฟเวอร์ไม่ได้ ตอนนี้เล่นกับบอทได้ตามปกติ';
    this.keep(this.inBox(this.text(stats, 25, me ? '#ffffff' : '#ffb3a7'), [278, 323, 628, 40]));
    this.keep(filled(this, A('panels-divider'), box([166, 391, 772, 4])));

    const mode: Mode = this.loginMode ? 'login' : me?.username ? 'member' : 'guest';
    const heading = {
      guest: 'สร้างบัญชีเพื่อเก็บความคืบหน้า',
      login: 'เข้าสู่ระบบบัญชีที่มีอยู่',
      member: 'บัญชีของคุณถูกเก็บไว้แล้ว',
    }[mode];
    const about = {
      guest: 'บัญชีปัจจุบันเป็นบัญชีชั่วคราวของเครื่องนี้ สร้างบัญชีเพื่อเก็บไอเทมและคะแนนไว้\nเล่นต่อได้ทุกอุปกรณ์',
      login: me?.username
        ? 'ใส่ชื่อผู้ใช้และรหัสผ่านของบัญชีที่จะสลับไปเล่น'
        : 'ใส่ชื่อผู้ใช้และรหัสผ่านของบัญชีเดิม\nบัญชีชั่วคราวบนเครื่องนี้จะไม่ถูกรวมเข้าไป',
      member: 'ไอเทม ชุด และคะแนนผูกกับชื่อผู้ใช้นี้\nเข้าเล่นจากเครื่องอื่นด้วยชื่อผู้ใช้และรหัสผ่านนี้ได้',
    }[mode];
    this.keep(placed(this, A('people'), box([202, 409, 64, 44])));
    const h = this.keep(this.inBox(this.text(heading, 35, '#ffe157', 3), [280, 405, 600, 48]));
    // the spark sits just past the end of the heading, as in the mockup
    const [, ey, , eh] = box([0, 397, 43, 48]);
    this.keep(placed(this, A('emphasis'), [h.x + h.displayWidth + 4, ey, 49, eh]));
    const desc = this.keep(this.text(about, 21, '#ffffff', 0).setLineSpacing(-4));
    const [dx, dy, dw, dh] = box([208, 459, 702, 52]);
    desc.setPosition(dx, dy + dh / 2).setOrigin(0, 0.5);
    fit(desc, dw, dh * 1.3);

    if (mode === 'member') {
      this.credential('user', 524, 'person', '', { value: me?.username ?? '', readOnly: true });
      this.keep(placed(this, A('emphasis'), box([151, 662, 47, 65])));
      this.button('btn-create', [187, 685, 363, 101], 'เข้าบัญชีอื่น', 40, () => {
        this.loginMode = true;
        this.typed = {};
        this.render();
      });
      this.button('btn-login', [571, 685, 358, 101], 'ออกจากระบบ', 36, () => this.act(async () => {
        await account.logout();
        syncSetup(this.registry);
      }, 'ออกจากระบบแล้ว เครื่องนี้เป็นบัญชีชั่วคราวใหม่'));
      return;
    }

    const login = mode === 'login';
    const submit = login
      ? () => this.act(async () => {
        await account.login(this.fields.user?.value ?? '', this.fields.pass?.value ?? '');
        syncSetup(this.registry);
        this.loginMode = false;
        this.typed = {};
        this.render();
      }, 'เข้าสู่ระบบแล้ว')
      : () => this.act(async () => {
        await account.register(this.fields.user?.value ?? '', this.fields.pass?.value ?? '');
        delete this.typed.pass;
        if (this.fields.pass) this.fields.pass.value = '';
      }, 'สร้างบัญชีแล้ว');
    this.credential('user', 524, 'person', login ? 'ชื่อผู้ใช้' : 'ชื่อผู้ใช้ (a-z, 0-9, _)', { onEnter: () => this.fields.pass?.focus() });
    this.credential('pass', 599, 'password', login ? 'รหัสผ่าน' : 'รหัสผ่าน (อย่างน้อย 6 ตัว)', { password: true, max: 200, onEnter: submit });
    this.keep(placed(this, A('emphasis'), box([151, 662, 47, 65])));
    this.button('btn-create', [187, 685, 363, 101], login ? 'เข้าสู่ระบบ' : 'สร้างบัญชี', 40, submit);
    this.button('btn-login', [571, 685, 358, 101], login ? 'ยกเลิก' : 'มีบัญชีอยู่แล้ว', 36, () => {
      this.loginMode = !login;
      delete this.typed.pass;
      this.render();
    });
  }

  /** A username or password row: the painted strip, its white icon, and the text box. */
  private credential(id: string, y: number, icon: string, placeholder: string, opts: Parameters<AccountScene['field']>[3] = {}): void {
    this.keep(filled(this, A('field'), box([208, y, 692, 61])));
    this.keep(placed(this, A(icon), box([229, y + 11, 42, 40])));
    this.field(id, [298, y + 6, 586, 50], placeholder, { size: 30, ...opts });
  }

  /** Head and shoulders of the player's real look, cut to the frame's window. */
  private portrait([x, y, w, h]: Box): Phaser.GameObjects.Image {
    const img = this.add.image(0, 0, lookTexture(this, loadSetup(this.registry).loadout)).setOrigin(0, 0);
    const W = img.width;
    const H = img.height;
    // the head fills about the middle 70% of the look's width, from the top down
    const fx = 0.15;
    const fw = 0.7;
    const s = w / (fw * W);
    const cy = H * 0.02;
    img.setCrop(fx * W, cy, fw * W, h / s).setScale(s).setPosition(x - fx * W * s, y - cy * s);
    return img;
  }

  private leaderboard(): void {
    const rows = this.board;
    if (rows && rows.length) {
      rows.slice(0, 10).forEach((r, i) => {
        const b: Box = [1083, 279 + i * 49, 467, 45];
        const row = this.keep(filled(this, A('row'), box(b)));
        if (i > 2) row.setAlpha(0.75);
        const color = ['#ffd84a', '#e3e8ff', '#ffb26b'][i] ?? '#ffffff';
        const [x, y, w, hh] = box(b);
        const cy = y + hh / 2;
        if (i === 0) this.keep(placed(this, A('crown'), [x + 14, cy - 18, 46, 32]));
        else this.keep(fit(this.text(String(i + 1), 26, color, 3).setOrigin(0.5).setPosition(x + 37, cy), 48, hh));
        this.keep(fit(this.text(r.displayName, 26, color, 3).setOrigin(0, 0.5).setPosition(x + 72, cy), w * 0.6, hh));
        this.keep(this.text(String(r.rating), 26, color, 3).setOrigin(1, 0.5).setPosition(x + w - 26, cy));
      });
      return;
    }
    // nobody to list yet: the empty podium from the mockup
    this.keep(filled(this, A('backdrop'), box([1100, 277, 430, 292])));
    const trophy = this.keep(placed(this, A('trophy'), box([1192, 362, 249, 159])));
    this.tweens.add({ targets: trophy, scaleX: trophy.scaleX * 1.04, scaleY: trophy.scaleY * 1.04, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.keep(filled(this, A('podium'), box([1135, 489, 365, 83])));
    this.keep(this.inBox(this.text('1', 53, '#24283d', 0), [1292, 499, 49, 56], 'center'));
    this.keep(placed(this, A('emphasis'), box([1381, 324, 54, 60])));
    this.keep(filled(this, A('row'), box([1083, 576, 469, 80])));
    const msg = rows ? 'ยังไม่มีใครแข่งขันจัดอันดับ' : this.boardFailed ? 'โหลดอันดับไม่ได้ ต้องต่อเซิร์ฟเวอร์' : 'กำลังโหลด…';
    this.keep(this.inBox(this.text(msg, 30, '#ffffff', 3), [1126, 591, 386, 45], 'center'));
  }
}

/** Grey-blue placeholder text in the painted fields (CSS can only set it with a rule). */
function placeholderStyle(): void {
  if (document.getElementById('bb-field-style')) return;
  const s = document.createElement('style');
  s.id = 'bb-field-style';
  s.textContent = '.bb-field::placeholder{color:#a3a9c4;opacity:1;text-shadow:none}';
  document.head.appendChild(s);
}
