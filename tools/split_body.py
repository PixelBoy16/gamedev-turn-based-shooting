"""Cut art-src/look/body.png into the five body parts the look lab can adjust one by one.

Run: python3 tools/split_body.py   (needs Pillow only)

Writes body-legs, body-torso, body-arm-left, body-arm-right and body-head (arms as seen on
screen) next to it, each on the same 1024 canvas. A layer drawn behind another reaches a few
px under it, so nudging a part a little does not open a seam. The cut lines fit the current
body (fists hanging beside the hips); a new body drawn in parts by ChatGPT replaces this.
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

LOOK = Path(__file__).resolve().parent.parent / 'art-src' / 'look'
NECK = 478  # head above
BELT = 676  # torso above, legs below (between the arms)
HIPS = 776  # below this only the fist bottoms are not legs
FISTS = 800  # ...and they end here
ARM_L, ARM_R = 408, 616  # arms outside these x
TUCK = 8  # how far a back layer reaches under the one in front


def box_mask(boxes):
    m = Image.new('L', (1024, 1024), 0)
    d = ImageDraw.Draw(m)
    for b in boxes:
        d.rectangle(b, fill=255)
    return m


def main():
    body = Image.open(LOOK / 'body.png').convert('RGBA')
    t = TUCK
    regions = {
        # drawn back to front, so each reaches under its front neighbours
        'body-legs': [(ARM_L - t, BELT - t, ARM_R + t, HIPS), (352 - t, HIPS - t, 672 + t, FISTS), (0, FISTS - t, 1023, 1023)],
        'body-torso': [(ARM_L - t, NECK - t, ARM_R + t, BELT)],
        'body-arm-left': [(0, NECK, ARM_L, HIPS), (0, HIPS, 352, FISTS)],
        'body-arm-right': [(ARM_R, NECK, 1023, HIPS), (672, HIPS, 1023, FISTS)],
        'body-head': [(0, 0, 1023, NECK)],
    }
    for name, boxes in regions.items():
        part = body.copy()
        part.putalpha(ImageChops.multiply(body.getchannel('A'), box_mask(boxes)))
        part.save(LOOK / f'{name}.png')
        print(f'✓ {name}.png')


if __name__ == '__main__':
    main()
