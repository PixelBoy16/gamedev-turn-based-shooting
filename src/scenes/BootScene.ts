import Phaser from 'phaser';
import { loadArt, makeArt } from '../art/chibi';
import { loadLook, prepareLook } from '../art/look';
import { initSfx } from '../audio/sfx';
import { account } from '../net/account';
import { syncSetup } from './setup';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    loadArt(this);
    loadLook(this);
  }

  create(): void {
    makeArt(this); // drawn placeholders, used wherever a generated sprite is missing
    prepareLook(this);
    initSfx(this.sound);
    void account.ensure().then(() => syncSetup(this.registry));
    // dev: ?lab opens the look lab for lining up painted layers
    const lab = import.meta.env.DEV && new URLSearchParams(location.search).has('lab');
    this.scene.start(lab ? 'looklab' : 'menu');
  }
}
