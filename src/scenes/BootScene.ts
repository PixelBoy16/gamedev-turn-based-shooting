import Phaser from 'phaser';
import { loadArt, makeArt } from '../art/chibi';
import { initSfx } from '../audio/sfx';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    loadArt(this);
  }

  create(): void {
    makeArt(this); // drawn placeholders, used wherever a generated sprite is missing
    initSfx(this.sound);
    this.scene.start('menu');
  }
}
