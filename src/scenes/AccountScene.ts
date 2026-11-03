import Phaser from 'phaser';
import { account } from '../net/account';
import { LeaderRow } from '../net/protocol';
import { Button, FONT, INK, label } from '../ui/widgets';
import { menuBackdrop } from './backdrop';
import { syncSetup } from './setup';

/** Name, stats, claiming a guest account with a username, signing in elsewhere, and the leaderboard. */
export default class AccountScene extends Phaser.Scene {
  private ui: Phaser.GameObjects.GameObject[] = [];
  private hint!: Phaser.GameObjects.Text;
  private board: LeaderRow[] | null = null;
  private loginMode = false;
  private busy = false;
  private stopAccount: (() => void) | null = null;

  constructor() {
    super('account');
  }

  create(): void {
    this.board = null;
    this.loginMode = false;
    // the battle's key bindings (W, A, S, D, E, R...) stay captured game-wide and would eat letters typed here
    this.input.keyboard?.clearCaptures();
    menuBackdrop(this);
    const shade = this.add.graphics();
    shade.fillStyle(0x10162a, 0.6);
    shade.fillRect(0, 0, 1920, 1080);
    label(this, 60, 30, 'บัญชีของฉัน', 56, '#ffd166');
    this.hint = label(this, 960, 1040, '', 28, '#ffd166').setOrigin(0.5);
    this.stopAccount = account.onChange(() => this.render());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stopAccount?.();
      this.ui = [];
    });
    void account.ensure().then(() => this.render());
    account.leaderboard().then((rows) => {
      this.board = rows;
      this.render();
    }).catch(() => undefined);
    this.render();
  }

  private say(msg: string): void {
    this.hint.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.hint);
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 2800, duration: 400 });
  }

  private add_<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.ui.push(o);
    return o;
  }

  private field(x: number, y: number, w: number, value: string, placeholder: string, opts: { password?: boolean; max?: number } = {}): HTMLInputElement {
    const el = document.createElement('input');
    el.value = value;
    el.placeholder = placeholder;
    el.maxLength = opts.max ?? 20;
    if (opts.password) {
      el.type = 'password';
      el.autocomplete = 'current-password';
    } else el.autocapitalize = 'off';
    el.style.cssText = `width:${w}px;height:68px;font:600 32px ${FONT};padding:0 18px;border-radius:14px;box-sizing:border-box;`
      + 'border:3px solid #ffd166;background:#1b2030;color:#fff;outline:none;';
    this.add_(this.add.dom(x, y, el).setOrigin(0, 0.5));
    return el;
  }

  /** Run a server call with the buttons locked; show its error in Thai. */
  private async act(fn: () => Promise<void>, done: string): Promise<void> {
    if (this.busy) return;
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

  private render(): void {
    if (!this.sys.isActive()) return;
    for (const o of this.ui) o.destroy();
    this.ui = [];
    this.add_(new Button(this, 200, 990, 260, 90, '← เมนู', { size: 34, onClick: () => this.scene.start('menu') }));
    const card = this.add_(this.add.graphics());
    card.fillStyle(INK, 0.85);
    card.fillRoundedRect(80, 130, 1060, 800, 30);
    card.fillRoundedRect(1180, 130, 660, 800, 30);
    this.leaderboard();

    const me = account.view;
    if (!me) {
      this.add_(label(this, 610, 480, 'ต่อเซิร์ฟเวอร์ไม่ได้ ตอนนี้เล่นกับบอทได้ตามปกติ', 30).setOrigin(0.5));
      return;
    }
    const x = 130;
    this.add_(label(this, x, 160, 'ชื่อที่แสดงในเกม', 28, '#cfd8ff'));
    const name = this.field(x, 240, 520, me.displayName, 'ชื่อ', { max: 12 });
    this.add_(new Button(this, 790, 240, 200, 68, 'บันทึกชื่อ', {
      size: 26, onClick: () => this.act(() => account.save({ displayName: name.value }), 'บันทึกชื่อแล้ว'),
    }));
    const winRate = me.played ? Math.round((me.wins / me.played) * 100) : 0;
    this.add_(label(this, x, 300, `คะแนนจัดอันดับ ${me.rating} (${me.rankedPlayed} เกม) · เล่นทั้งหมด ${me.played} · ชนะ ${me.wins} (${winRate}%)`, 26));

    if (me.username && !this.loginMode) {
      this.add_(label(this, x, 400, `ชื่อผู้ใช้: ${me.username}`, 32, '#7CFC9A'));
      this.add_(label(this, x, 450, 'เข้าเล่นจากเครื่องอื่นด้วยชื่อผู้ใช้และรหัสผ่านนี้ได้', 24, '#cfd8ff'));
      this.add_(new Button(this, 300, 560, 340, 84, 'ออกจากระบบ', {
        size: 30, onClick: () => this.act(async () => {
          await account.logout();
          syncSetup(this.registry);
        }, 'ออกจากระบบแล้ว เครื่องนี้เป็นบัญชีชั่วคราวใหม่'),
      }));
      return;
    }

    if (this.loginMode) {
      this.add_(label(this, x, 400, 'เข้าสู่ระบบบัญชีที่มีอยู่', 34, '#ffd166'));
      this.add_(label(this, x, 450, me.username ? '' : 'บัญชีชั่วคราวบนเครื่องนี้จะไม่ถูกรวมเข้าไป', 24, '#ff8787'));
      const user = this.field(x, 540, 520, '', 'ชื่อผู้ใช้');
      const pass = this.field(x, 630, 520, '', 'รหัสผ่าน', { password: true, max: 200 });
      this.add_(new Button(this, 300, 750, 340, 90, 'เข้าสู่ระบบ', {
        fill: 0x2f9e44, size: 32, onClick: () => this.act(async () => {
          await account.login(user.value, pass.value);
          syncSetup(this.registry);
          this.loginMode = false;
          this.render();
        }, 'เข้าสู่ระบบแล้ว'),
      }));
      this.add_(new Button(this, 700, 750, 300, 90, 'ยกเลิก', { size: 30, onClick: () => { this.loginMode = false; this.render(); } }));
      return;
    }

    // a guest: offer to keep this account with a username
    this.add_(label(this, x, 400, 'ตอนนี้เป็นบัญชีชั่วคราวของเครื่องนี้', 32, '#ffd166'));
    this.add_(label(this, x, 446, 'ตั้งชื่อผู้ใช้และรหัสผ่าน เพื่อเก็บชุดและคะแนนไว้เล่นต่อในเครื่องอื่น', 24, '#cfd8ff'));
    const user = this.field(x, 540, 520, '', 'ชื่อผู้ใช้ (a-z, 0-9, _)');
    const pass = this.field(x, 630, 520, '', 'รหัสผ่าน (อย่างน้อย 6 ตัว)', { password: true, max: 200 });
    this.add_(new Button(this, 300, 750, 340, 90, 'สร้างบัญชี', {
      fill: 0x2f9e44, size: 32, onClick: () => this.act(() => account.register(user.value, pass.value), 'สร้างบัญชีแล้ว'),
    }));
    this.add_(new Button(this, 760, 750, 420, 90, 'มีบัญชีอยู่แล้ว', { size: 30, onClick: () => { this.loginMode = true; this.render(); } }));
  }

  private leaderboard(): void {
    this.add_(label(this, 1510, 160, 'อันดับคะแนนสูงสุด', 34, '#ffd166').setOrigin(0.5, 0));
    if (!this.board) {
      this.add_(label(this, 1510, 480, 'กำลังโหลด…', 28).setOrigin(0.5));
      return;
    }
    if (!this.board.length) {
      this.add_(label(this, 1510, 480, 'ยังไม่มีใครแข่งจัดอันดับ', 28).setOrigin(0.5));
      return;
    }
    this.board.slice(0, 12).forEach((r, i) => {
      const y = 240 + i * 54;
      const color = i === 0 ? '#ffd166' : '#e6ecff';
      this.add_(label(this, 1230, y, `${i + 1}.`, 28, color));
      this.add_(label(this, 1290, y, r.displayName, 28, color));
      this.add_(label(this, 1800, y, String(r.rating), 28, color).setOrigin(1, 0));
    });
  }
}
