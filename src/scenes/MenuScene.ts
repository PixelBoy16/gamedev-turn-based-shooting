import Phaser from 'phaser';
import { ART_SCALE, poseTexture } from '../art/chibi';
import { CHARACTER_IDS } from '../core/data';
import { Button, label } from '../ui/widgets';
import { menuBackdrop } from './backdrop';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    menuBackdrop(this);
    const title = label(this, 960, 170, 'Crater Clash', 120, '#ffd166').setOrigin(0.5);
    this.tweens.add({ targets: title, y: 180, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    label(this, 960, 270, 'ยิงหนึ่งนัด เปลี่ยนแผนที่ทั้งแผ่น', 38).setOrigin(0.5);

    CHARACTER_IDS.forEach((id, i) => {
      const img = this.add.image(760 + i * 200, 960, poseTexture(this, id, 'idle')).setOrigin(0.5, 1).setScale(ART_SCALE * 2.2);
      if (i === 1) img.setFlipX(true);
      this.tweens.add({ targets: img, scaleY: img.scaleY * 1.04, duration: 700 + i * 90, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    new Button(this, 960, 450, 560, 120, 'เล่นกับบอท', { fill: 0x2f9e44, size: 48, onClick: () => this.scene.start('setup') });
    new Button(this, 960, 610, 560, 120, 'เล่นออนไลน์', { fill: 0x4c6ef5, size: 48 }).setEnabled(false);
    label(this, 960, 690, 'เร็ว ๆ นี้ (milestone 3)', 26).setOrigin(0.5);
  }
}
