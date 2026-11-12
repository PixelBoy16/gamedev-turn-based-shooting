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
RANKED = SRC / 'black-boom-ranked-parts' / 'public' / 'black-boom-ranked'
LOBBY = SRC / 'black-boom-lobby-parts' / 'public' / 'black-boom-lobby'
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
    # ranked screen (layout: new_ui/black-boom-ranked-parts/layout.json, a 1671x941 mockup)
    'ranked/panel': (RANKED / 'panels/main.png', 1300),
    'ranked/trophy-glow': (RANKED / 'effects/trophy-glow.png', 500),
    'ranked/trophy-mount': (RANKED / 'panels/trophy-mount.png', 440),
    'ranked/trophy': (RANKED / 'icons/trophy.png', 340),
    'ranked/avatar-ring': (RANKED / 'effects/avatar-ring.png', 250),
    'ranked/rating': (RANKED / 'panels/rating-base.png', 430),
    'ranked/rules': (RANKED / 'panels/rules-base.png', 1000),
    'ranked/info': (RANKED / 'icons/info.png', 60),
    'ranked/rays': (RANKED / 'effects/match-rays.png', 860),
    'ranked/hero': (RANKED / 'characters/hero-left.png', 380),
    'ranked/scout': (RANKED / 'characters/scout-right.png', 320),
    'ranked/crate-left': (RANKED / 'decorations/crate-left.png', 420),
    'ranked/crate-right': (RANKED / 'decorations/crate-right.png', 430),
    'ranked/header': (RANKED / 'header/base.png', 790),
    'ranked/logo': (RANKED / 'header/logo.png', 210),
    'ranked/btn-match': (RANKED / 'buttons/match/base.png', 770),
    'ranked/ico-match': (RANKED / 'buttons/match/icon.png', 170),
    'ranked/btn-wardrobe': (RANKED / 'buttons/wardrobe/base.png', 280),
    'ranked/ico-wardrobe': (RANKED / 'buttons/wardrobe/icon.png', 70),
    'ranked/btn-menu': (RANKED / 'buttons/menu/base.png', 270),
    'ranked/ico-menu': (RANKED / 'buttons/menu/icon.png', 70),
    'ranked/btn-back': (RANKED / 'buttons/back/base.png', 110),
    'ranked/ico-back': (RANKED / 'buttons/back/icon.png', 60),
    # friends lobby (layout: new_ui/black-boom-lobby-parts/layout.json, a 1672x941 mockup)
    'lobby/panel': (LOBBY / 'panels/main.png', 1350),
    'lobby/header': (LOBBY / 'header/base.png', 790),
    'lobby/logo': (LOBBY / 'header/logo.png', 210),
    'lobby/people': (LOBBY / 'icons/people.png', 100),
    'lobby/person': (LOBBY / 'icons/person.png', 64),
    'lobby/wifi': (LOBBY / 'icons/wifi.png', 56),
    'lobby/avatar-ring': (LOBBY / 'effects/avatar-ring.png', 230),
    'lobby/emphasis': (LOBBY / 'effects/emphasis.png', 100),
    'lobby/or': (LOBBY / 'panels/or-base.png', 110),
    'lobby/hero': (LOBBY / 'characters/hero-left.png', 380),
    'lobby/scout': (LOBBY / 'characters/scout-right.png', 360),
    'lobby/crate-left': (LOBBY / 'decorations/crate-left.png', 390),
    'lobby/crate-right': (LOBBY / 'decorations/crate-right.png', 410),
    'lobby/btn-create': (LOBBY / 'buttons/create/base.png', 590),
    'lobby/ico-create': (LOBBY / 'buttons/create/icon.png', 170),
    'lobby/btn-join': (LOBBY / 'buttons/join/base.png', 550),
    'lobby/ico-join': (LOBBY / 'buttons/join/icon.png', 200),
    'lobby/btn-wardrobe': (LOBBY / 'buttons/wardrobe/base.png', 250),
    'lobby/ico-wardrobe': (LOBBY / 'buttons/wardrobe/icon.png', 70),
    'lobby/btn-edit': (LOBBY / 'buttons/edit/base.png', 80),
    'lobby/ico-edit': (LOBBY / 'buttons/edit/icon.png', 60),
    'lobby/input-name': (LOBBY / 'inputs/name/base.png', 650),
    'lobby/input-code': (LOBBY / 'inputs/code/base.png', 670),
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
    for sub in ('ranked', 'lobby'):
        (OUT / sub).mkdir(parents=True, exist_ok=True)
    for name, (src, width) in FILES.items():
        save(fit(Image.open(src).convert('RGBA'), width), name)
    save(fit(plus(), 70), 'plus')
    save(fit(status_plate(), 590), 'status')
    for src, name in ((ASSETS / 'backgrounds/arena.png', 'menu-bg'), (RANKED / 'backgrounds/ranked-arena.png', 'ranked/bg'),
                      (LOBBY / 'backgrounds/friends-arena.png', 'lobby/bg')):
        bg = Image.open(src).convert('RGB')
        path = OUT / f'{name}.jpg'
        bg.save(path, 'JPEG', quality=86, optimize=True, progressive=True)
        print(f'{path.relative_to(PROJECT)}  {bg.width}x{bg.height}  {path.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
