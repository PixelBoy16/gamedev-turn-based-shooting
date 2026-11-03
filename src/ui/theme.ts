import type Phaser from 'phaser';

// The look of every menu: dark steel plates with cut corners, fire orange and red for
// emphasis, gold for rewards. Change a colour here and every screen follows.

export const THEME = {
  ink: 0x0d0f15, // outlines and text strokes
  panel: 0x1a1d26, // big backgrounds behind content
  steel: 0x3a404d, // default button face
  steelDark: 0x262a33,
  fire: 0xff7a1a, // selected edge, primary call to action
  red: 0xd63a2a,
  gold: 0xffc23d, // coins, rewards
  green: 0x3f8f3a, // ready / go
  blue: 0x3b5ba8, // team, friends
  purple: 0x6a3fb5, // gems, Battle Pass
  text: '#ffffff',
  muted: '#b9c0cf',
  accent: '#ffb347',
};

export interface Point {
  x: number;
  y: number;
}

/** The outline of a w×h plate centred on 0,0 with its corners cut; the cut is at most a third of the short side. */
export function platePoints(w: number, h: number, cut: number): Point[] {
  const c = Math.min(cut, Math.min(w, h) / 3);
  const x = w / 2;
  const y = h / 2;
  return [
    { x: -x + c, y: -y }, { x: x - c, y: -y }, { x, y: -y + c }, { x, y: y - c },
    { x: x - c, y }, { x: -x + c, y }, { x: -x, y: y - c }, { x: -x, y: -y + c },
  ];
}

// Graphics only reads x and y off its points.
const vec = (p: Point[]) => p as unknown as Phaser.Math.Vector2[];

export interface PlateOpts {
  cut?: number;
  rivets?: boolean;
  selected?: boolean;
}

/** A steel plate: dark outline, a darker lip underneath, the face, a bright top edge, optional rivets. */
export function drawPlate(g: Phaser.GameObjects.Graphics, w: number, h: number, fill: number, opts: PlateOpts = {}): void {
  const cut = opts.cut ?? Math.min(18, h / 4);
  const shade = (c: number, f: number) =>
    (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f);
  g.fillStyle(THEME.ink, 0.95);
  g.fillPoints(vec(platePoints(w + 10, h + 18, cut + 3).map((p) => ({ x: p.x, y: p.y + 4 }))), true);
  g.fillStyle(shade(fill, 0.6), 1);
  g.fillPoints(vec(platePoints(w, h, cut).map((p) => ({ x: p.x, y: p.y + 8 }))), true);
  g.fillStyle(fill, 1);
  g.fillPoints(vec(platePoints(w, h, cut)), true);
  g.lineStyle(3, 0xffffff, 0.22);
  g.lineBetween(-w / 2 + cut, -h / 2 + 3, w / 2 - cut, -h / 2 + 3);
  if (opts.rivets) {
    g.fillStyle(0xffffff, 0.35);
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.fillCircle(x * (w / 2 - cut * 0.9), y * (h / 2 - cut * 0.9), 3.5);
  }
  if (opts.selected) {
    g.lineStyle(5, THEME.fire, 1);
    g.strokePoints(vec(platePoints(w, h, cut)), true, true);
  }
}
