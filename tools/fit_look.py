"""Fit cropped dress-up pieces onto the base body's canvas.

Run: python3 tools/fit_look.py [name ...]   (needs Pillow only; no names = every piece in the plan)

Pieces drawn on their own (any canvas size, just the item) go in art-src/look-raw/. Each one is
trimmed to its opaque pixels, scaled to a width and placed on a 1024x1024 transparent canvas
at the spot given in art-src/look-raw/plan.json, as  "name": [width, centreX, topY]  in body.png
pixels, and written to art-src/look/. Then check with tools/check_look.py.
"""
import json
import sys
from pathlib import Path
from PIL import Image

ART = Path(__file__).resolve().parent.parent / 'art-src'
SIZE = 1024


def fit(name, width, cx, top):
    im = Image.open(ART / 'look-raw' / f'{name}.png').convert('RGBA')
    im = im.crop(im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox())
    k = width / im.width
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE))
    canvas.alpha_composite(im, (round(cx - im.width / 2), round(top)))
    canvas.save(ART / 'look' / f'{name}.png')


def main():
    plan = json.loads((ART / 'look-raw' / 'plan.json').read_text())
    names = sys.argv[1:] or list(plan)
    for name in names:
        if name not in plan:
            print(f'{name}: ไม่มีใน plan.json')
            return 1
        fit(name, *plan[name])
        print(f'✓ {name}.png')
    return 0


if __name__ == '__main__':
    sys.exit(main())
