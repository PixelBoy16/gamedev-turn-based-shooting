"""Slice and clean the generated art in art-src/ into game-ready sprites.

Run: python3 tools/prepare_art.py [part ...]   (needs Pillow only; parts: characters weapons
terrain icons backgrounds, none = all). Writes public/art/sprites/*. Re-run whenever a source sheet changes.
Sources stay outside public/ so the big originals are not shipped with the game.
"""
import sys
from collections import deque
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

PROJECT = Path(__file__).resolve().parent.parent
ROOT = PROJECT / 'art-src'
OUT = PROJECT / 'public' / 'art' / 'sprites'
POSES = ['idle', 'walk', 'aim', 'shoot', 'hurt', 'dead']
# each sheet: the guns on it, left to right
WEAPON_SHEETS = {
    'weapons.png': ['cannon', 'hammer', 'splitter', 'drill'],
    'weapons-2.png': ['shovel', 'bouncer', 'beam', 'mortar', 'magnet', 'dirtbomb'],
}
ICONS = ['double', 'power', 'warp', 'heal', 'armor', 'burrow', 'wall', 'calm']


def components(im, expected, step=2, thresh=110):
    """Connected blobs of opaque pixels (on a 1/step grid). The `expected` biggest are sprites;
    smaller ones (sparks, stars) join the nearest sprite. Returns one mask per sprite, left to right."""
    w, h = im.size
    a = im.getchannel('A').load()
    gw, gh = w // step, h // step
    solid = [[a[x * step, y * step] > thresh for x in range(gw)] for y in range(gh)]
    label = [[-1] * gw for _ in range(gh)]
    blobs = []
    for y in range(gh):
        for x in range(gw):
            if not solid[y][x] or label[y][x] >= 0:
                continue
            idx = len(blobs)
            q = deque([(x, y)])
            label[y][x] = idx
            x0 = x1 = x
            y0 = y1 = y
            n = 0
            while q:
                cx, cy = q.popleft()
                n += 1
                x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < gw and 0 <= ny < gh and solid[ny][nx] and label[ny][nx] < 0:
                        label[ny][nx] = idx
                        q.append((nx, ny))
            blobs.append({'id': idx, 'n': n, 'box': [x0, y0, x1, y1]})
    ranked = sorted(blobs, key=lambda b: -b['n'])
    big = ranked[:expected]
    if len(big) < expected:
        raise SystemExit(f'expected {expected} sprites, found {len(big)}')
    owner = {b['id']: b['id'] for b in big}
    for s in ranked[expected:]:
        if s['n'] < 4:
            continue  # specks and halo noise
        cx = (s['box'][0] + s['box'][2]) / 2
        tgt = min(big, key=lambda b: 0 if b['box'][0] <= cx <= b['box'][2] else min(abs(cx - b['box'][0]), abs(cx - b['box'][2])))
        owner[s['id']] = tgt['id']
    big.sort(key=lambda b: b['box'][0])
    masks = []
    for b in big:
        m = Image.new('L', (gw, gh), 0)
        mp = m.load()
        for y in range(gh):
            row = label[y]
            for x in range(gw):
                if row[x] >= 0 and owner.get(row[x]) == b['id']:
                    mp[x, y] = 255
        # back to full size, grown a little to keep the anti-aliased outline
        masks.append(m.resize((w, h), Image.NEAREST).filter(ImageFilter.MaxFilter(7)))
    return masks


def clean_alpha(im, floor=40):
    r, g, b, a = im.split()
    a = a.point(lambda v: 0 if v < floor else v)
    return Image.merge('RGBA', (r, g, b, a))


def crop_sprite(im, mask):
    """Keep only this sprite's pixels, then trim."""
    out = im.copy()
    out.putalpha(ImageChops.multiply(im.getchannel('A'), mask))
    return out.crop(out.getbbox())


def characters():
    for char in ['mole', 'mason', 'sparky']:
        im = clean_alpha(Image.open(ROOT / 'characters' / f'{char}.png').convert('RGBA'))
        frames = [crop_sprite(im, m) for m in components(im, 6)]
        scale = 150 / frames[0].height  # idle stands 150 px tall in the file (shown at 0.5×)
        for pose, f in zip(POSES, frames):
            f = f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), Image.LANCZOS)
            f.save(OUT / f'{char}-{pose}.png')
        print(char, [f.size for f in frames])


def weapons():
    for sheet, ids in WEAPON_SHEETS.items():
        im = clean_alpha(Image.open(ROOT / 'weapons' / sheet).convert('RGBA'))
        for wid, m in zip(ids, components(im, len(ids))):
            f = crop_sprite(im, m)
            f = f.resize((160, round(f.height * 160 / f.width)), Image.LANCZOS)
            f.save(OUT / f'gun-{wid}.png')
            print(wid, f.size)


def is_backdrop(p):
    r, g, b = p[:3]
    return min(r, g, b) > 200 and max(r, g, b) - min(r, g, b) < 18  # white / light-grey checker


def terrain():
    im = Image.open(ROOT / 'terrain' / 'terrain.png').convert('RGBA')
    w, h = im.size
    px = im.load()
    # dirt tile: the non-white square on the left (scan a row above the grass strip)
    xs = [x for x in range(w // 2) if not is_backdrop(px[x, 100])]
    ys = [y for y in range(h) if not is_backdrop(px[w // 4, y])]
    tile = im.crop((xs[0] + 10, ys[0] + 10, xs[-1] - 10, ys[-1] - 10)).resize((256, 256), Image.LANCZOS)
    tile.save(OUT / 'dirt.png')
    # grass strip: everything not backdrop on the right half
    right = im.crop((xs[-1] + 4, 0, w, h))
    data = [(0, 0, 0, 0) if is_backdrop(p) else p for p in right.getdata()]
    right.putdata(data)
    strip = right.crop(right.getbbox())
    strip = strip.resize((round(strip.width * 48 / strip.height), 48), Image.LANCZOS)
    strip.save(OUT / 'grass.png')
    print('dirt', tile.size, 'grass', strip.size)


def icons():
    im = Image.open(ROOT / 'icons' / 'skills.png').convert('RGBA')
    centres = [(206, 322), (576, 322), (954, 322), (1328, 322), (206, 690), (576, 690), (954, 690), (1328, 690)]
    r = 176
    for name, (cx, cy) in zip(ICONS, centres):
        tile = im.crop((cx - r, cy - r, cx + r, cy + r))
        mask = Image.new('L', (r * 8, r * 8), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, r * 8 - 1, r * 8 - 1), fill=255)
        tile.putalpha(mask.resize(tile.size, Image.LANCZOS))
        tile.resize((128, 128), Image.LANCZOS).save(OUT / f'icon-{name}.png')
    print('icons', len(ICONS))


def backgrounds():
    for name in ['hills', 'islands', 'mine']:
        im = Image.open(ROOT / 'backgrounds' / f'{name}.png').convert('RGB')
        im = im.resize((round(im.width * 1080 / im.height), 1080), Image.LANCZOS)
        im.save(OUT / f'bg-{name}.jpg', quality=86)
        print('bg', name, im.size)


PARTS = {'characters': characters, 'weapons': weapons, 'terrain': terrain, 'icons': icons, 'backgrounds': backgrounds}

if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    for part in sys.argv[1:] or PARTS:
        PARTS[part]()
