"""Check painted dress-up layers before they go into the game.

Run: python3 tools/check_look.py [folder]   (needs Pillow only; folder defaults to art-src/look)

For every PNG: a 1024x1024 canvas, a transparent background, a name the game knows, not empty,
and (once body.png exists) not a whole redrawn character. body.png is also checked for where
the figure stands, since every other layer is lined up against it. Prints what is still missing
for the three menu characters and for the full wardrobe. Exits 1 if any file has a problem.
Prompts for each file: docs/art/character-prompts.md.
"""
import json
import sys
from pathlib import Path
from PIL import Image

PROJECT = Path(__file__).resolve().parent.parent
SIZE = 1024
# where look.ts expects the base body to stand (SRC_HEAD, SRC_FEET, SRC_X)
HEAD, FEET, MID = 120, 964, 512
# the three looks on the first screen (MenuScene.chibis), with their defaults filled in
MENU = [
    'body',
    'hair-ponytail-back', 'hair-ponytail-front', 'glasses-goggles', 'cloth-vest', 'eyes-squint', 'face-warpaint',
    'hat-aviator', 'hair-spiky-back', 'hair-spiky-front', 'back-cape', 'face-scar', 'cloth-tank', 'eyes-glare',
    'set-bearskull-body', 'set-bearskull-hood', 'eyes-glow', 'back-ammo',
]
# the body cut into parts (src/art/lookNames.ts BODY_PARTS); together they stand in for body.png
BODY_PARTS = ['body-legs', 'body-torso', 'body-arm-left', 'body-arm-right', 'body-head']
# pieces that may legitimately cover most of the body
BIG = ('cloth-', 'set-', 'back-', 'body-')


def piece_files(slot, pid):
    """Same naming as pieceFiles() in src/art/lookNames.ts."""
    if pid == 'none':
        return []
    if slot == 'hair':
        return [f'hair-{pid}-back', f'hair-{pid}-front']
    if slot == 'set':
        return [f'set-{pid}-body', f'set-{pid}-hood']
    return [f'{slot}-{pid}']


def all_files():
    config = json.loads((PROJECT / 'config' / 'game.json').read_text())
    return ['body', *BODY_PARTS] + [n for f in config['fashion'] for n in piece_files(f['slot'], f['id'])]


def opaque(im):
    return im.getchannel('A').point(lambda a: 255 if a > 40 else 0)


def check(path, known, body_area):
    """Problems with one file (empty list when fine), and its opaque area."""
    name = path.stem
    problems = []
    if name not in known:
        problems.append('ชื่อไฟล์ไม่ตรงกับชิ้นไหนใน config/game.json')
    im = Image.open(path)
    if im.size != (SIZE, SIZE):
        problems.append(f'ผืนขนาด {im.size[0]}x{im.size[1]} ต้องเป็น {SIZE}x{SIZE}')
    if 'A' not in im.getbands():
        return problems + ['ไม่มีช่องโปร่งใส (พื้นหลังทึบ)'], 0
    im = im.convert('RGBA')
    mask = opaque(im)
    w, h = im.size
    corners = [(0, 0), (w - 16, 0), (0, h - 16), (w - 16, h - 16)]
    if any(mask.crop((x, y, x + 16, y + 16)).getbbox() for x, y in corners):
        problems.append('มุมผืนไม่โปร่งใส (น่าจะมีพื้นหลัง)')
    box = mask.getbbox()
    if not box:
        return problems + ['ว่างเปล่า ไม่มีภาพเลย'], 0
    area = sum(1 for p in mask.getdata() if p)
    if area > 0.6 * w * h:
        problems.append('ภาพทึบเกิน 60% ของผืน (น่าจะมีพื้นหลัง)')
    if name == 'body':
        top, bottom, mid = box[1], box[3], (box[0] + box[2]) / 2
        if abs(top - HEAD) > 60:
            problems.append(f'หัวอยู่ที่ y={top} ควรอยู่ราว {HEAD}')
        if abs(bottom - FEET) > 40:
            problems.append(f'เท้าอยู่ที่ y={bottom} ควรอยู่ราว {FEET}')
        if abs(mid - MID) > 40:
            problems.append(f'ตัวอยู่ที่ x={mid:.0f} ควรอยู่กลางผืนราว {MID}')
    elif body_area and not name.startswith(BIG) and area > 0.7 * body_area:
        problems.append('ใหญ่เกือบเท่าตัว: น่าจะวาดตัวละครมาด้วย ต้องการแค่ชิ้นนั้น')
    return problems, area


def main():
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else PROJECT / 'art-src' / 'look'
    if not folder.is_dir():
        print(f'ไม่มีโฟลเดอร์ {folder} (สร้างแล้ววางไฟล์ .png ไว้ในนั้น)')
        return 1
    known = all_files()
    files = sorted(folder.glob('*.png'))
    body = folder / 'body.png'
    body_area = check(body, known, 0)[1] if body.exists() else 0
    bad = 0
    good = set()
    for path in files:
        problems, _ = check(path, known, body_area)
        print(f"{'✗' if problems else '✓'} {path.name}")
        for p in problems:
            print(f'    - {p}')
        if problems:
            bad += 1
        else:
            good.add(path.stem)
    if all(p in good for p in BODY_PARTS):
        good.add('body')  # the parts stand in for a whole body.png
    known = [n for n in known if n not in BODY_PARTS]
    for title, want in (('3 ตัวในหน้าเมนู', MENU), ('ตู้เสื้อผ้าทั้งหมด', known)):
        missing = [n for n in want if n not in good]
        print(f'\n{title}: ผ่านแล้ว {len(want) - len(missing)}/{len(want)}')
        if missing:
            print('  ยังขาดหรือยังไม่ผ่าน: ' + ', '.join(f'{n}.png' for n in missing))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
