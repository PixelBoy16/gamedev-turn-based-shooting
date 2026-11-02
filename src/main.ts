import Phaser from 'phaser';
import BootScene from './scenes/BootScene';
import MenuScene from './scenes/MenuScene';
import SetupScene from './scenes/SetupScene';
import BattleScene from './scenes/BattleScene';
import HudScene from './scenes/HudScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1920,
  height: 1080,
  backgroundColor: '#9fd3f7',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 }, // tablet: hold FIRE while nudging the angle, or pan with two fingers
  scene: [BootScene, MenuScene, SetupScene, BattleScene, HudScene],
});

// Dev-only handle for debugging from the browser console.
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
