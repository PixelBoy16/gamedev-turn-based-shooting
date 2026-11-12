"""Shrink the cut-up first-screen art in new_ui/ into game-ready files in public/art/ui/.

Run: python3 tools/prepare_menu_ui.py   (needs Pillow only). new_ui/ is the designer's drop
(gitignored, ~50 MB of 2000px PNGs); the outputs are sized for the 1920x1080 canvas and committed.
Layout boxes for MenuScene come from new_ui/black-boom-assets/manifest.json (1672x941 mockup).
"""
from pathlib import Path
from PIL import Image

PROJECT = Path(__file__).resolve().parent.parent
SRC = PROJECT / 'new_ui'
ASSETS = SRC / 'black-boom-assets' / 'public' / 'black-boom'
BUTTONS = SRC / 'black-boom-button-parts' / 'public' / 'black-boom-button-parts'
CURRENCY = SRC / 'black-boom-currency-parts' / 'public' / 'black-boom-currency-parts'
OUT = PROJECT / 'public' / 'art' / 'ui'

# output file -> (source, width in px on the 1920 canvas, roughly what MenuScene shows it at)
FILES = {
    'logo': (ASSETS / 'branding/logo.png', 700),
    'slogan': (ASSETS / 'branding/slogan.png', 660),
    'char-scout': (ASSETS / 'characters/scout.png', 300),
    'char-hero': (ASSETS / 'characters/hero.png', 380),
    'char-bear': (ASSETS / 'characters/bear.png', 300),
    'trail': (ASSETS / 'effects/projectile-trail.png', 280),
    'btn-bot': (BUTTONS / 'bot/base.png', 760),
    'btn-friends': (BUTTONS / 'friends/base.png', 820),
    'btn-ranked': (BUTTONS / 'ranked/base.png', 790),
    'btn-shop': (BUTTONS / 'shop/base.png', 380),
    'btn-pass': (BUTTONS / 'battle-pass/base.png', 430),
    'btn-settings': (BUTTONS / 'settings/base.png', 110),
    'ico-bot': (BUTTONS / 'bot/icon.png', 180),
    'ico-friends': (BUTTONS / 'friends/icon.png', 180),
    'ico-ranked': (BUTTONS / 'ranked/icon.png', 180),
    'ico-shop': (BUTTONS / 'shop/icon.png', 120),
    'ico-pass': (BUTTONS / 'battle-pass/icon.png', 120),
    'ico-settings': (BUTTONS / 'settings/icon.png', 80),
    'arrow': (BUTTONS / 'shared/arrow.png', 40),
    'cur-coins': (CURRENCY / 'coins/base.png', 290),
    'cur-gems': (CURRENCY / 'gems/base.png', 290),
    'ico-coin': (CURRENCY / 'coins/icon.png', 80),
    'ico-gem': (CURRENCY / 'gems/icon.png', 80),
}


def fit(im: Image.Image, width: int) -> Image.Image:
    if im.width <= width:
        return im
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def save(im: Image.Image, name: str) -> None:
    path = OUT / f'{name}.webp'
    im.save(path, 'WEBP', quality=90, method=6)
    print(f'{path.relative_to(PROJECT)}  {im.width}x{im.height}  {path.stat().st_size // 1024} KB')


def plus() -> Image.Image:
    """The gold + button as one image: the blank tile with the symbol in its middle 56%."""
    base = Image.open(CURRENCY / 'shared/plus-base.png').convert('RGBA')
    sym = Image.open(CURRENCY / 'shared/plus-symbol.png').convert('RGBA')
    box = (round(base.width * 0.56), round(base.height * 0.56))
    sym.thumbnail(box, Image.LANCZOS)
    base.alpha_composite(sym, ((base.width - sym.width) // 2, (base.height - sym.height) // 2))
    return base


def status_plate() -> Image.Image:
    """The player card with its baked 'offline' text, dot and wifi glyph wiped off (the drop has
    no blank version): each row of the inner panel is refilled with a blend between the clean
    strips just left and right of the text, which keeps the panel's top-to-bottom shading."""
    im = Image.open(ASSETS / 'hud/player-status.png').convert('RGBA')
    px = im.load()
    x0, x1, y0, y1 = 525, 1758, 108, 350  # measured on the 1935x503 source

    def avg(xs, y):
        c = [px[x, y] for x in xs]
        return [sum(v[i] for v in c) / len(c) for i in range(4)]

    for y in range(y0, y1):
        left, right = avg(range(x0 - 8, x0), y), avg(range(x1, x1 + 8), y)
        for x in range(x0, x1):
            t = (x - x0) / (x1 - x0)
            px[x, y] = tuple(round(left[i] * (1 - t) + right[i] * t) for i in range(4))
    return im


def main() -> None:
    if not SRC.exists():
        raise SystemExit('new_ui/ not found: put the designer drop at the project root first')
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (src, width) in FILES.items():
        save(fit(Image.open(src).convert('RGBA'), width), name)
    save(fit(plus(), 70), 'plus')
    save(fit(status_plate(), 590), 'status')
    bg = Image.open(ASSETS / 'backgrounds/arena.png').convert('RGB')
    path = OUT / 'menu-bg.jpg'
    bg.save(path, 'JPEG', quality=86, optimize=True, progressive=True)
    print(f'{path.relative_to(PROJECT)}  {bg.width}x{bg.height}  {path.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
