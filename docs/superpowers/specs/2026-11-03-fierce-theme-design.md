# Black Boom: fierce theme (characters + UI)

Date: 2026-11-03 · Status: draft for approval

## Why

The game was renamed to Black Boom. Its look is still cute (big-headed chibi, soft round
buttons, sunny sky), which fights the new name. The owner wants it to feel tough, the way
Brawl Stars does: still cartoon, but the faces and the UI have attitude.

## Goals

- Characters in style **B** (chosen from three sketches): cartoon, thick dark outlines,
  saturated colour, but head about **1/3** of the height (now about 1/2), broad shoulders,
  thick arms and legs, frowning brows, narrowed eyes, a smirk with teeth, scars allowed.
- Cute wardrobe pieces become tough ones. They are **replaced, not deleted**: every slot
  keeps about as many choices, and the prices and Battle Pass places stay the same.
- The menu screens get a hard, military look instead of soft and bright.
- Until painted art arrives, the drawn stand-ins already show the new style.

## Non-goals

- No realism and no gore: no blood, no realistic guns. It stays a cartoon (style C,
  "mercenary", was rejected as too far).
- The battle maps, weapons, physics and balance are unchanged. Map backgrounds may get a
  darker grade later; that is not part of this work.
- The shop and pass rules, the not-pay-to-win rule and the server don't change.

## Anti-goals (a failure even if it works)

- Text or buttons that are hard to read on a tablet. Dark UI must keep strong contrast.
- A look that is grim or edgy enough to shut out younger players. Brawl Stars is the limit.
- Anything that looks copied from Brawl Stars, DDTank or BoomZ: no names, shapes or assets.

## Characters

- One base character, as now. Fashion changes the look; equipment only changes stats.
- The default face (no face piece chosen) is the tough one: frowning brows, smirk with teeth.
- Painted art keeps the layer system (`src/art/look/`, one PNG per piece, `align.json`). The
  owner generates a new `body.png` and new pieces in style B; the list is at the end.

### Wardrobe changes

Ids change where the meaning changes; only team test accounts own items today, so lost
ownership of old ids is acceptable (enforceOwned already strips unknown pieces). Prices,
currencies and Battle Pass places carry over from the piece each one replaces.

| Slot | Old → new (id: Thai name) |
|---|---|
| hat | aviator (kept), crown → `spikecrown`: มงกุฎเหล็กหนาม, beanie → `bandana`: ผ้าโพกหัว (pass tier 10), helm (kept) |
| glasses | round → `goggles`: แว่นกันลม, shades (kept) |
| hair | short → `buzz`: ผมเกรียน (default), spiky (kept), ponytail (kept), bob → `mohawk`: ทรงโมฮอว์ก |
| face | blush → `warpaint`: ลายพรางหน้า (free), bandaid → `scar`: แผลเป็น, mustache → `beard`: เคราดุ |
| cloth | tee → `tank`: เสื้อกล้ามทหาร (default), armor: เกราะเหล็ก (renamed), robe → `trench`: โค้ทสนาม, ninja (kept), dress → `vest`: เสื้อเกราะเบา |
| eyes | round → `glare`: ตาจ้อง (default), happy → `squint`: ตาหรี่, sharp (kept), star → `glow`: ตาเรืองแสง |
| set | bear → `bearskull`: ชุดกะโหลกหมี (pass exclusive, tier 20) |
| back | wings → `ironwings`: ปีกเหล็ก (pass exclusive, tier 15), backpack → `ammo`: เป้กระสุน, cape: ผ้าคลุมขาดวิ่น (renamed) |

All the places that name a piece move with it: `config/game.json` (fashion list, pass rewards),
the defaults in `src/core/gear.ts`, the showcase looks in `MenuScene`, the drawn pieces in
`src/art/chibi.ts`, and tests.

## UI

- **Palette:** dark steel and near-black panels, fire orange and red for emphasis, gold for
  rewards. Green and blue stay only where they mean something (ready/team colours).
- **Shapes:** buttons and cards are plates with chamfered (cut) corners, a darker bottom lip,
  a thin highlight edge and small rivets on larger cards. No soft pill shapes.
- **Type:** Kanit (open font licence, has Thai) in heavy weights for titles and buttons,
  bundled with the game through the `@fontsource/kanit` package (not fetched from Google at runtime). Text keeps a dark outline.
- **Backdrop:** until a new painted one exists, the painted hills get a dusk grade (dark
  orange to near-black) with drifting smoke, so menus already read as a battlefield.
- **Scope:** every menu screen (menu, wardrobe, lobby, ranked, account, shop, Battle Pass)
  and the in-battle HUD buttons and result screen, through the shared widgets.

## Builder notes

- The shared look lives in `src/ui/widgets.ts` (`Button`, `label`, `confirmBox`) and
  `MenuScene`'s `MenuCard`; changing those carries most screens. Put the colours in one
  place so a later tweak is one edit.
- The drawn character is baked into a texture with fixed size and a feet anchor; battle
  code places weapons with `lookHand()`. Keep the feet anchor and the hand position API;
  the texture size may change if every caller still fits.
- Left to the builder: exact colours, chamfer size, rivet details, the drawn shapes of each
  piece, and how the dusk grade is made.

## Art for the owner to generate (style B)

`body.png` (base body, front facing, arms down, no clothes beyond a plain tank top line),
then one transparent PNG per piece on the same canvas and pose, named `<slot>-<id>.png`
(hair: `-back`/`-front`, set: `-body`/`-hood`), plus a dusk battlefield `menu-bg.jpg`, the
Black Boom logo and fierce versions of the menu icons. Exact prompts are given in chat.
