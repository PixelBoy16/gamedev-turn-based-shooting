"""Fit the body pieces onto the dress-up canvas, so the look lab can move and turn each one.

Run: python3 tools/fit_body.py   (needs Pillow only)

The pieces in art-src/look-raw/body/ are cut from one painted figure on a shared 1024 canvas,
at the size it was drawn (head top near y=68). They are scaled together to where body.png
stands (head top 120, feet 964) and written to art-src/look/. Each piece reaches a few px
under the pieces drawn in front of it (BODY_PARTS order in src/art/lookNames.ts), so the
cut lines do not show as seams and a part nudged a little opens no gap.
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageFilter

ART = Path(__file__).resolve().parent.parent / 'art-src'
RAW = ART / 'look-raw' / 'body'
SIZE = 1024
# the drawn figure to body.png: scale to this width, top-left at this spot (matched pixel by pixel)
FIT = 936
AT = (44, 58)
TUCK = 9  # px a back piece reaches under its front neighbours (drawn size)
# back to front, as BODY_PARTS
ORDER = [
    'body-legs', 'body-foot-left', 'body-foot-right', 'body-upperarm-left', 'body-upperarm-right',
    'body-forearm-left', 'body-forearm-right', 'body-torso', 'body-neck', 'body-hand-left', 'body-hand-right', 'body-head',
]


def grow(mask):
    for _ in range(TUCK):
        mask = mask.filter(ImageFilter.MaxFilter(3))
    return mask


def main():
    pieces = [Image.open(RAW / f'{n}.png').convert('RGBA') for n in ORDER]
    whole = Image.new('RGBA', (SIZE, SIZE))
    for p in pieces:
        whole.alpha_composite(p)
    solid = [p.getchannel('A').point(lambda a: 255 if a > 0 else 0) for p in pieces]
    for i, (name, piece) in enumerate(zip(ORDER, pieces)):
        front = Image.new('L', (SIZE, SIZE))
        for m in solid[i + 1:]:
            front = ImageChops.lighter(front, m)
        reach = ImageChops.multiply(grow(solid[i]), front)
        out = piece.copy()
        out.paste(whole, (0, 0), reach)
        out = out.resize((FIT, FIT), Image.LANCZOS)
        canvas = Image.new('RGBA', (SIZE, SIZE))
        canvas.alpha_composite(out, AT)
        canvas.save(ART / 'look' / f'{name}.png')
        print(f'✓ {name}.png')


if __name__ == '__main__':
    main()
