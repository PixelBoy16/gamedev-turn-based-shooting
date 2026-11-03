import Phaser from 'phaser';

/**
 * Background for the menu screens: the painted menu scene (art/sprites/menu-bg.jpg) when
 * it exists, else the painted hills from the battle maps, else drawn sky and hills.
 * Painted art is scaled to cover the screen, cropping the sides.
 */
export function menuBackdrop(scene: Phaser.Scene): void {
  const key = ['art-menu-bg', 'art-bg-hills'].find((k) => scene.textures.exists(k));
  if (key) {
    const img = scene.add.image(960, 540, key);
    img.setScale(Math.max(1920 / img.width, 1080 / img.height));
    return;
  }
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
