import Phaser from 'phaser';
import { ART_SCALE, lookRes, lookTexture } from '../art/chibi';
import { DEFAULT_LOADOUT, Loadout } from '../core/gear';
import { account } from '../net/account';
import { net } from '../net/NetClient';
import { Button, label, walletText } from '../ui/widgets';
import { menuBackdrop } from './backdrop';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    if (net.inRoom) {
      // reloaded mid-room: go straight back (the lobby rejoins and resumes a running match)
      this.scene.start('lobby');
      return;
    }
    menuBackdrop(this);
    const title = label(this, 960, 170, 'Crater Clash', 120, '#ffd166').setOrigin(0.5);
    this.tweens.add({ targets: title, y: 180, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    label(this, 960, 270, 'ยิงหนึ่งนัด เปลี่ยนแผนที่ทั้งแผ่น', 38).setOrigin(0.5);

    // the same chibi, dressed three ways
    const dress = (look: Partial<Loadout['look']>, weapon: Loadout['weapon']): Loadout =>
      ({ ...DEFAULT_LOADOUT, weapon, look: { ...DEFAULT_LOADOUT.look, ...look } });
    const looks: Loadout[] = [
      dress({ hat: 'aviator', hair: 'spiky', back: 'cape', face: 'bandaid' }, 'cannon'),
      dress({ hair: 'ponytail', glasses: 'round', cloth: 'dress', eyes: 'happy', face: 'blush' }, 'splitter'),
      dress({ set: 'bear', eyes: 'star', back: 'backpack' }, 'hammer'),
    ];
    looks.forEach((l, i) => {
      const img = this.add.image(760 + i * 200, 960, lookTexture(this, l)).setOrigin(0.5, 1).setScale(ART_SCALE * 2.2 * lookRes());
      if (i === 1) img.setFlipX(true);
      this.tweens.add({ targets: img, scaleY: img.scaleY * 1.04, duration: 700 + i * 90, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    new Button(this, 960, 400, 560, 110, 'เล่นกับบอท', { fill: 0x2f9e44, size: 46, onClick: () => {
      this.registry.set('setupMode', null);
      this.scene.start('setup');
    } });
    new Button(this, 960, 530, 560, 110, 'เล่นกับเพื่อน', { fill: 0x4c6ef5, size: 46, onClick: () => this.scene.start('lobby') });
    label(this, 960, 600, 'สร้างห้อง แล้วส่งรหัส 6 หลักให้เพื่อน', 24).setOrigin(0.5);
    new Button(this, 960, 690, 560, 110, 'แข่งจัดอันดับ', { fill: 0xe0a400, size: 46, onClick: () => this.scene.start('ranked') });
    label(this, 960, 760, 'จับคู่กับผู้เล่นฝีมือใกล้กัน', 24).setOrigin(0.5);

    // who you are, top right; tap to manage the account. Shop and pass below it.
    const badge = new Button(this, 1700, 70, 400, 84, '', { size: 26, onClick: () => this.scene.start('account') });
    const wallet = label(this, 1890, 122, '', 24).setOrigin(1, 0);
    new Button(this, 1600, 210, 190, 76, 'ร้านค้า', { fill: 0xe0a400, size: 28, onClick: () => this.scene.start('shop') });
    new Button(this, 1800, 210, 190, 76, 'Battle Pass', { fill: 0x7b4fd6, size: 26, onClick: () => this.scene.start('pass') });
    const showBadge = () => {
      const a = account.view;
      badge.text.setText(a ? `${a.displayName} · ${a.rating}${a.username ? '' : '  (ชั่วคราว)'}` : 'บัญชี (ออฟไลน์)');
      wallet.setText(a ? walletText(a.coins, a.gems) : '');
    };
    showBadge();
    const stop = account.onChange(showBadge);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
    void account.ensure();
  }
}
