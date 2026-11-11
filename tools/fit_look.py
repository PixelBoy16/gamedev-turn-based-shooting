"""Fit cropped dress-up pieces onto the base body's canvas.

Run: python3 tools/fit_look.py [name ...]   (needs Pillow only; no names = every piece in the plan)

Pieces drawn on their own (any canvas size, just the item) go in art-src/look-raw/. Each one is
trimmed to its opaque pixels, scaled to a width and placed on a 1024x1024 transparent canvas
at the spot given in art-src/look-raw/plan.json, as  "name": [width, centreX, topY]  in body.png
pixels, and written to art-src/look/. A fourth number, [width, centreX, topY, height], squashes
the piece to that height. Then check with tools/check_look.py.

A hairstyle can come as one drawing, hair-<id>.png: it is placed the same way, then cut along the
head's outline (art-src/look/body-head.png) into hair-<id>-back.png, what sticks out past the head,
and hair-<id>-front.png, what lies over it.
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageFilter

ART = Path(__file__).resolve().parent.parent / 'art-src'
SIZE = 1024
TUCK = 9  # px the back of a hairstyle reaches under the front, so the cut does not show


def place(name, width, cx, top, height=None):
    im = Image.open(ART / 'look-raw' / f'{name}.png').convert('RGBA')
    im = im.crop(im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox())
    k = width / im.width
    im = im.resize((round(im.width * k), round(height or im.height * k)), Image.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE))
    canvas.alpha_composite(im, (round(cx - im.width / 2), round(top)))
    return canvas


def whole_hair(name):
    return name.startswith('hair-') and not name.endswith(('-back', '-front'))


def split_hair(hair):
    """The parts of a placed hairstyle behind and in front of the head."""
    head = Image.open(ART / 'look' / 'body-head.png').getchannel('A').point(lambda a: 255 if a > 0 else 0)
    solid = hair.getchannel('A').point(lambda a: 255 if a > 0 else 0)
    front = ImageChops.multiply(solid, head)
    back = ImageChops.subtract(solid, front)
    for _ in range(TUCK):
        back = back.filter(ImageFilter.MaxFilter(3))
    back = ImageChops.multiply(back, solid)
    parts = []
    for m in (back, front):
        out = Image.new('RGBA', (SIZE, SIZE))
        out.paste(hair, (0, 0), m)
        parts.append(out)
    return parts


def main():
    plan = json.loads((ART / 'look-raw' / 'plan.json').read_text())
    names = sys.argv[1:] or list(plan)
    for name in names:
        if name not in plan:
            print(f'{name}: ไม่มีใน plan.json')
            return 1
        canvas = place(name, *plan[name])
        if whole_hair(name):
            for part, im in zip(('back', 'front'), split_hair(canvas)):
                im.save(ART / 'look' / f'{name}-{part}.png')
                print(f'✓ {name}-{part}.png')
        else:
            canvas.save(ART / 'look' / f'{name}.png')
            print(f'✓ {name}.png')
    return 0


if __name__ == '__main__':
    sys.exit(main())
