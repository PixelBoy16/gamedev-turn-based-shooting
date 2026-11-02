# Crater Clash — bot-mode MVP (milestone 2)

Turn-based artillery on the web: aim against the wind, crater the ground, knock enemies off the map.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests for src/core
npm run build
```

## What's in

- Menu → setup (character, 3 of 5 items, map, 1v1 / 1v2 / 2v2, bot difficulty) → battle → results
- 3 characters, each with a main weapon and a skill (3-turn cooldown)
  - ตุ่นตุ๊ก: cannon, burrow (immune until next turn, ends turn)
  - เจ้ากำแพง: stone hammer (heavy, low arc, half wind), earth wall
  - พลุไฟ: split rocket (3 shells at apex, 1.5× wind), no-wind shot
- Shared drill (2 per match): bores a tunnel before exploding
- Items: double shot, +30% power, warp, heal 250, armor
- Maps: เนินหญ้า, เกาะลอย (void below), เหมืองถ้ำ (low ceiling)
- Bots: easy / normal / hard; plan by simulating shots over several frames, use items and skills on normal and hard
- Sudden death after turn 30: water rises 40 px a turn
- Touch controls for tablets (shown on touch, hidden when a mouse moves); two-finger drag pans
- Placeholder sound effects synthesised with Web Audio (`src/audio/sfx.ts`) until real SFX files exist
- Bots that can't hit anyone from where they stand walk toward the nearest enemy once, then re-plan
- Chibi art generated with ChatGPT (see Art below); the code-drawn chibis in `src/art/chibi.ts` are the fallback

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Walk | ← → / A D (uses fuel) | ◀ ▶ |
| Aim | ↑ ↓ / W S (Shift = fine) | มุม+ / มุม− (tap = 1°, hold = sweep) |
| Charge + fire | hold Space, release | hold ยิง |
| Weapon | 1 main, 2 drill | slots |
| Item | 3 4 5 | slots |
| Skill | E | slot |
| Pan map | right-drag, C re-centre | two-finger drag, กล้อง |
| Restart / menu | R / Esc | เมนู |
| Sound on/off | M | เสียง |

## Tuning

Core numbers: `TUNING` in `src/core/World.ts`. Weapons, skills, items: `src/core/data.ts`. Maps and spawns: `src/core/Maps.ts`.
`tests/core.test.ts` checks that every main weapon can reach the far spawn on every map in any wind, so retunes that break reachability fail the tests.

## Layout

- `src/core/`: pure TypeScript game logic (no Phaser), deterministic per seed, so it can run on a server later
- `src/scenes/`: Boot, Menu, Setup, Battle (world, camera, effects), Hud (screen-space UI + touch)
- `src/art/`, `src/ui/`: placeholder art and shared widgets

## Art

Generated source sheets live in `art-src/{characters,weapons,backgrounds,terrain,icons}/` (outside `public/`, so they are not shipped).
`python3 tools/prepare_art.py` (needs Pillow) slices and cleans them into `public/art/sprites/`, which the game loads.
Re-run it after replacing a sheet. Anything missing falls back to the drawn placeholders in `src/art/chibi.ts`.
