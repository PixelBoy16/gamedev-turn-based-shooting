import Phaser from 'phaser';
import '@fontsource/kanit/400.css';
import '@fontsource/kanit/700.css';
import '@fontsource/kanit/900.css';
import BootScene from './scenes/BootScene';
import MenuScene from './scenes/MenuScene';
import SetupScene from './scenes/SetupScene';
import BattleScene from './scenes/BattleScene';
import HudScene from './scenes/HudScene';
import LobbyScene from './scenes/LobbyScene';
import LookLabScene from './scenes/LookLabScene';
import RankedScene from './scenes/RankedScene';
import AccountScene from './scenes/AccountScene';
import ShopScene from './scenes/ShopScene';
import PassScene from './scenes/PassScene';
import { account } from './net/account';
import { net } from './net/NetClient';

// Canvas text can't wait for a web font, so start once Kanit is in (or after 3 s without it).
await Promise.race([
  Promise.all(['400 40px Kanit', '700 40px Kanit', '900 40px Kanit'].map((f) => document.fonts.load(f, 'กขA'))).catch(() => undefined),
  new Promise((ok) => setTimeout(ok, 3000)),
]);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1920,
  height: 1080,
  backgroundColor: '#9fd3f7',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  dom: { createContainer: true }, // text inputs in the online lobby
  input: { activePointers: 3 }, // tablet: hold FIRE while nudging the angle, or pan with two fingers
  scene: [BootScene, MenuScene, SetupScene, LobbyScene, BattleScene, HudScene, RankedScene, AccountScene, ShopScene, PassScene, LookLabScene],
});

// Dev-only handle for debugging from the browser console.
if (import.meta.env.DEV) Object.assign(window, { game, net, account });
