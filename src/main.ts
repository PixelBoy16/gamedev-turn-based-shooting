import Phaser from 'phaser';
import BootScene from './scenes/BootScene';
import MenuScene from './scenes/MenuScene';
import SetupScene from './scenes/SetupScene';
import BattleScene from './scenes/BattleScene';
import HudScene from './scenes/HudScene';
import LobbyScene from './scenes/LobbyScene';
import LookLabScene from './scenes/LookLabScene';
import { net } from './net/NetClient';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1920,
  height: 1080,
  backgroundColor: '#9fd3f7',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  dom: { createContainer: true }, // text inputs in the online lobby
  input: { activePointers: 3 }, // tablet: hold FIRE while nudging the angle, or pan with two fingers
  scene: [BootScene, MenuScene, SetupScene, LobbyScene, BattleScene, HudScene, LookLabScene],
});

// Dev-only handle for debugging from the browser console.
if (import.meta.env.DEV) Object.assign(window, { game, net });
