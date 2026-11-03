import Phaser from 'phaser';

/**
 * Background for the menu screens: the painted menu scene (art/sprites/menu-bg.jpg) when
 * it exists; else the painted hills from the battle maps graded to a smoky dusk, so the
 * menus already read as a battlefield; else drawn sky and hills, graded the same way.
 * Painted art is scaled to cover the screen, cropping the sides.
 */
export function menuBackdrop(scene: Phaser.Scene): void {
  if (scene.textures.exists('art-menu-bg')) {
    cover(scene, 'art-menu-bg');
    return;
  }
  if (scene.textures.exists('art-bg-hills')) cover(scene, 'art-bg-hills');
  else drawnHills(scene);
  dusk(scene);
}

function cover(scene: Phaser.Scene, key: string): void {
  const img = scene.add.image(960, 540, key);
  img.setScale(Math.max(1920 / img.width, 1080 / img.height));
}

/** Near-black sky, a burnt-orange glow on the horizon, dark ground, and slow drifting smoke. */
function dusk(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillGradientStyle(0x07080c, 0x07080c, 0x8a3a10, 0x8a3a10, 0.78, 0.78, 0.42, 0.42);
  g.fillRect(0, 0, 1920, 560);
  g.fillGradientStyle(0x8a3a10, 0x8a3a10, 0x07080c, 0x07080c, 0.42, 0.42, 0.7, 0.7);
  g.fillRect(0, 560, 1920, 520);
  const puffs = [[300, 380, 700], [1300, 300, 900], [800, 520, 1100], [1700, 600, 600]].map(([x, y, w]) =>
    scene.add.ellipse(x, y, w, w * 0.22, 0x9aa0aa, 0.1));
  const drift = (_t: number, dt: number) => {
    for (const p of puffs) {
      p.x -= dt * 0.03;
      if (p.x < -p.width / 2) p.x = 1920 + p.width / 2;
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, drift);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, drift));
}

function drawnHills(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillGradientStyle(0x7cc6f2, 0x7cc6f2, 0xd7f0ff, 0xd7f0ff, 1);
  g.fillRect(0, 0, 1920, 1080);
  g.fillStyle(0xffffff, 0.85);
  for (const [x, y, s] of [[260, 160, 1], [1500, 120, 1.3], [980, 260, 0.8], [1750, 380, 0.7]]) {
    g.fillEllipse(x, y, 180 * s, 60 * s);
    g.fillEllipse(x + 50 * s, y - 25 * s, 120 * s, 70 * s);
  }
  g.fillStyle(0x8fcf6b, 1);
  g.beginPath();
  g.moveTo(0, 1080);
  for (let x = 0; x <= 1920; x += 40) g.lineTo(x, 880 + Math.sin(x / 210) * 40 + Math.sin(x / 90) * 12);
  g.lineTo(1920, 1080);
  g.closePath();
  g.fillPath();
  g.fillStyle(0x9c6b43, 1);
  g.fillRect(0, 1000, 1920, 80);
}
