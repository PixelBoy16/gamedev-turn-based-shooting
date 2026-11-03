import Phaser from 'phaser';
import { ART_SCALE, lookRes, lookTexture } from '../art/chibi';
import { account } from '../net/account';
import { net } from '../net/NetClient';
import { ServerMsg } from '../net/protocol';
import { Button, INK, label } from '../ui/widgets';
import { menuBackdrop } from './backdrop';
import { loadSetup } from './setup';

/**
 * Ranked 1v1: wait in the server's queue for a player of similar rating; the match
 * starts by itself. Also where a ranked match in progress is resumed or forfeited.
 */
export default class RankedScene extends Phaser.Scene {
  private ui: Phaser.GameObjects.GameObject[] = [];
  private status!: Phaser.GameObjects.Text;
  private waitingSince = 0;
  private asked = false;
  private handler = (msg: ServerMsg) => this.onNet(msg);
  private statusHandler = () => this.render();
  private stopAccount: (() => void) | null = null;

  constructor() {
    super('ranked');
  }

  create(): void {
    this.waitingSince = 0;
    this.asked = false;
    menuBackdrop(this);
    const shade = this.add.graphics();
    shade.fillStyle(0x10162a, 0.6);
    shade.fillRect(0, 0, 1920, 1080);
    label(this, 60, 30, 'แข่งจัดอันดับ', 56, '#ffd166');
    this.status = label(this, 960, 640, '', 40).setOrigin(0.5);

    net.on('any', this.handler);
    net.on('status', this.statusHandler);
    this.stopAccount = account.onChange(() => this.render());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      net.off('any', this.handler);
      net.off('status', this.statusHandler);
      this.stopAccount?.();
      if (this.waitingSince) net.send({ t: 'unqueue' });
      this.ui = [];
    });
    net.connect();
    void account.ensure().then(() => this.render());
    this.render();
  }

  update(): void {
    if (this.waitingSince) {
      const s = Math.floor((Date.now() - this.waitingSince) / 1000);
      this.status.setText(`กำลังหาคู่แข่ง… ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    }
  }

  private onNet(msg: ServerMsg): void {
    if (msg.t === 'match') {
      this.waitingSince = 0;
      this.scene.start('battle', { online: true });
    } else if (msg.t === 'queue') {
      this.waitingSince = msg.waiting ? Date.now() : 0;
      this.render();
    } else if (msg.t === 'error') {
      this.waitingSince = 0;
      this.asked = false;
      this.status.setText(msg.msg);
    } else if (msg.t === 'account' || msg.t === 'room' || msg.t === 'left') this.render();
  }

  private add_<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.ui.push(o);
    return o;
  }

  private render(): void {
    if (!this.sys.isActive()) return;
    for (const o of this.ui) o.destroy();
    this.ui = [];
    const card = this.add_(this.add.graphics());
    card.fillStyle(INK, 0.85);
    card.fillRoundedRect(460, 150, 1000, 760, 32);
    this.add_(new Button(this, 200, 990, 260, 90, '← เมนู', { size: 34, onClick: () => this.scene.start('menu') }));

    // came back from a ranked match still being played
    const room = net.room;
    if (room?.ranked && room.playing) {
      this.add_(label(this, 960, 260, 'แมตช์จัดอันดับยังเล่นอยู่', 44).setOrigin(0.5));
      this.add_(new Button(this, 960, 440, 520, 110, 'กลับไปเล่นต่อ', { fill: 0x2f9e44, size: 40, onClick: () => net.send({ t: 'resume' }) }));
      this.add_(new Button(this, 960, 590, 520, 96, 'ออก (นับว่าแพ้)', {
        fill: 0xc0392b, size: 34, onClick: () => {
          net.leave();
          this.scene.start('menu');
        },
      }));
      this.status.setText('');
      return;
    }

    const me = account.view;
    if (!net.connected || !me) {
      this.status.setText(net.connected ? 'กำลังโหลดบัญชี…' : 'กำลังต่อเซิร์ฟเวอร์…');
      return;
    }
    const setup = loadSetup(this.registry);
    this.add_(this.add.image(960, 560, lookTexture(this, setup.loadout)).setOrigin(0.5, 1).setScale(ART_SCALE * 2 * lookRes()));
    this.add_(label(this, 960, 200, `${me.displayName} · คะแนน ${me.rating}`, 40, '#ffd166').setOrigin(0.5, 0));
    this.add_(label(this, 960, 262, 'จับคู่ 1 ต่อ 1 กับผู้เล่นฝีมือใกล้กัน · ไม่ใช้ค่าจากอุปกรณ์ วัดกันที่ฝีมือ', 26, '#cfd8ff').setOrigin(0.5, 0));

    if (this.waitingSince) {
      this.add_(new Button(this, 960, 790, 420, 100, 'ยกเลิก', {
        size: 38, onClick: () => {
          net.send({ t: 'unqueue' });
          this.waitingSince = 0;
          this.asked = false;
          this.render();
        },
      }));
      this.add_(label(this, 960, 700, 'รอนานขึ้น = ยอมจับคู่กับคะแนนที่ห่างขึ้น', 24, '#cfd8ff').setOrigin(0.5));
      return;
    }
    this.status.setText('');
    this.add_(new Button(this, 960, 760, 520, 120, 'หาคู่แข่ง', {
      fill: 0xe0a400, size: 46, onClick: () => {
        if (!net.authed || this.asked) return;
        this.asked = true;
        const s = loadSetup(this.registry);
        net.send({ t: 'queue', name: me.displayName, loadout: s.loadout, items: s.items });
      },
    }));
    this.add_(new Button(this, 1300, 470, 230, 60, 'แต่งตัว', {
      size: 26, onClick: () => {
        this.registry.set('setupMode', 'ranked');
        this.scene.start('setup');
      },
    }));
  }
}
