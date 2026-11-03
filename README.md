# Crater Clash — bot mode + friend rooms (milestone 3)

Turn-based artillery on the web: aim against the wind, crater the ground, knock enemies off the map.

```bash
npm install
npm run dev     # http://localhost:5173 (also on your LAN IP, for tablets)
npm run server  # room server for online play, ws://<host>:2567
npm test        # unit tests for src/core and the room server
npm run build
```

## What's in

- Menu → wardrobe (fashion, equipment, weapon, 3 of 5 items, map, 1v1 / 1v2 / 2v2, bot difficulty) → battle → results
- One plain chibi for everyone, dressed in the wardrobe (`src/core/gear.ts`, screen in `SetupScene`)
  - Fashion (8 slots: hat, glasses, hair, face, outfit, eyes, full set, back) changes only the look, never stats, so it can be sold freely. Hat and glasses can be hidden
  - Equipment (4 slots: necklace, ring, bracelet, charm) gives stats and shows only as icons. Every piece is a sidegrade (HP / attack / defence / walking) worth zero net points, checked by a test
  - Weapons: each has its own skill (3-turn cooldown): ปืนใหญ่ = ไร้ลม, ค้อนหิน = กำแพงดิน, จรวดแตก = ห่าฝน (5 fragments), พลั่วระเบิด = มุดดิน. Secondary slot is the shared drill; the "special" slot is reserved
  - The look is drawn in layers and baked once per combination (`lookTexture` in `src/art/chibi.ts`); painted layer art can replace each layer later
- Shared drill (2 per match): bores a tunnel before exploding
- Items: double shot, +30% power, warp, heal 250, armor
- Maps: เนินหญ้า, เกาะลอย (void below), เหมืองถ้ำ (low ceiling)
- Bots: easy / normal / hard; plan by simulating shots over several frames, use items and skills on normal and hard
- Sudden death after turn 30: water rises 40 px a turn
- Touch controls for tablets (shown on touch, hidden when a mouse moves); two-finger drag pans
- Placeholder sound effects synthesised with Web Audio (`src/audio/sfx.ts`) until real SFX files exist
- Bots that can't hit anyone from where they stand walk toward the nearest enemy once, then re-plan
- Backgrounds, terrain, weapons and icons generated with ChatGPT (see Art below); the chibi and gear are code-drawn for now

## Playing with friends (online)

1. Run `npm run dev` and `npm run server` on one computer.
2. Everyone opens the game from that computer's address (e.g. `http://192.168.1.20:5173`; Vite prints it), menu → เล่นกับเพื่อน.
3. One player creates a room and shares the 6-digit code; the others join with it.
4. The host picks map, 1v1 / 2v2 and bot difficulty; empty seats are filled by bots. Players can switch teams and change gear/items in the room.

How it works:
- The server (`server/`) runs the same `src/core` simulation and is the authority: it validates every action, owns the turn clock, wind and bots.
- Clients send moves (10/s while walking/aiming), items, skills and the final shot; everyone animates the shot locally from the same start state.
- At each turn start the server sends every tank's true state plus a terrain hash; a client whose map drifted (float differences between browsers) re-downloads the terrain.
- A reload or dropped connection rejoins the same seat (token in sessionStorage). Your turns time out while you're away. A player who leaves the room is replaced by a bot.
- Set `VITE_SERVER_URL` to point the client at a hosted server; `PORT` changes the server port.

## Deploying (Render)

`render.yaml` describes both parts: the room server (Node web service, health check `/health`) and the game (static site built with `VITE_SERVER_URL` set to the server's host).

1. Push this repo to GitHub.
2. On render.com: New → Blueprint → pick the repo → Apply. Both services build; later pushes redeploy them.
3. Open the `crater-clash` static site URL and share it.

The free server sleeps after 15 idle minutes; the first player after that waits about a minute.

## Game config (for game masters)

Every number and name players see lives in `config/game.json`: rules (`rules`), per-match limits (`limits`), weapons, skills, items and their values, equipment (stats must give and cost the same points) and the fashion list.

1. Edit the file.
2. `npm run check-config`: lists mistakes in Thai and exits non-zero if the file can't be used.
3. Restart the server (on Render: push, or Manual Deploy). The server refuses to start with a broken config, and sends its numbers to every client at match start, so online matches always agree. Bot mode uses the numbers built into the game.

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

Core numbers: `TUNING` in `src/core/World.ts`. Weapons, skills, items: `src/core/data.ts`. Fashion, equipment and the stat point values: `src/core/gear.ts`. Maps and spawns: `src/core/Maps.ts`.
`tests/core.test.ts` checks that every main weapon can reach the far spawn on every map in any wind, so retunes that break reachability fail the tests.

## Layout

- `src/core/`: pure TypeScript game logic (no Phaser), shared by the browser and the server; `Match.ts` resolves a shot the same way in both
- `src/net/`: message protocol and the browser's WebSocket client
- `server/`: room server (`rooms.ts` is transport-free and unit-tested; `index.ts` adds WebSockets)
- `src/scenes/`: Boot, Menu, Setup, Lobby (friend rooms), Battle (world, camera, effects; offline or online), Hud (screen-space UI + touch)
- `src/art/`, `src/ui/`: placeholder art and shared widgets

## Art

Generated source sheets live in `art-src/{characters,weapons,backgrounds,terrain,icons}/` (outside `public/`, so they are not shipped).
`python3 tools/prepare_art.py` (needs Pillow) slices and cleans them into `public/art/sprites/`, which the game loads.
Re-run it after replacing a sheet. Anything missing falls back to the drawn placeholders in `src/art/chibi.ts`.
