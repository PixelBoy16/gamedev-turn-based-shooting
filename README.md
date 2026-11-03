# Black Boom — bot mode + friend rooms (milestone 3)

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

## Team test server (Docker + Cloudflare tunnel)

The whole game in Docker on one machine, with PostgreSQL, for testing inside the team.
The room server also serves the built pages, so one address carries the game, `/admin`,
the APIs and the WebSocket. This is not the production setup.

```bash
cp .env.example .env                     # set ADMIN_PASSWORD
docker compose up -d --build             # http://localhost:8080 (admin: /admin)
docker compose --profile tunnel up -d    # share it: a temporary https://*.trycloudflare.com
npm run tunnel-url                       # print that address
```

- The quick tunnel needs no Cloudflare account, but its address changes every time the
  `tunnel` container restarts. For a fixed address on your own domain, create a tunnel in
  Cloudflare Zero Trust, point its public hostname at `http://game:2567`, put its token in
  `TUNNEL_TOKEN` and use `--profile named-tunnel` instead.
- After pulling new code: `docker compose up -d --build`. Players, results and published
  configs stay in the `db` volume; `docker compose down -v` wipes them.
- The game port is bound to this machine only (`127.0.0.1`), because the server trusts the
  player address the tunnel reports (`TRUST_PROXY`) for its sign-in rate limits.
- The game stops when this machine sleeps or Docker stops.

## Deploying (Render)

`render.yaml` describes both parts: the room server (Node web service, health check `/health`) and the game (static site built with `VITE_SERVER_URL` set to the server's host).

1. Push this repo to GitHub.
2. On render.com: New → Blueprint → pick the repo → Apply. Both services build; later pushes redeploy them.
3. Open the `black-boom` static site URL and share it.

The free server sleeps after 15 idle minutes; the first player after that waits about a minute.

## Accounts and ranked play

- The first time the game opens it creates a guest account in the background (no sign-up). The wardrobe, name and results are saved to it.
- บัญชี (top right of the menu): change the display name, give the guest account a username and password to play on another device, sign in to an existing account, and see the leaderboard.
- แข่งจัดอันดับ: the server pairs two signed-in players whose ratings are within 100 points, widening by 10 points a second while they wait. The match starts at once, has no bots, and ignores equipment stats. Ratings move by Elo (K = 32) when it ends; the result screen shows the change.
- Friend rooms count towards matches played and wins, not rating.

Data lives in PostgreSQL when `DATABASE_URL` is set (any host: Neon and Supabase have free tiers). Without it the server uses an embedded Postgres (PGlite) in `DATA_DIR` (default `./data`), which is what local development and the tests use; nothing to install. Tables are created on start (`server/db.ts`).

Server pieces: `server/db.ts` (connection + migrations), `server/accounts.ts` (guests, usernames with scrypt-hashed passwords, sessions stored as hashes, Elo), `server/api.ts` (HTTP `/api/...`), and the `auth` / `queue` messages in `server/rooms.ts`. Client: `src/net/account.ts`, `AccountScene`, `RankedScene`.

## Shop and Battle Pass

Nothing sold changes who wins: fashion is looks only, and equipment (stats) is sold for coins only, never gems, and is switched off in ranked anyway.

- Currencies: **coins** (🪙) are earned by playing; **gems** (💎) are premium. New accounts start with `economy.startCoins` / `startGems`. Gems also come from the Battle Pass and from admins; buying gems with real money is not built yet (it needs a payment provider).
- Prices live in `config/game.json` on each fashion and equipment entry: `"price": { "coins": 300 }` or `{ "gems": 60 }`; no price = free for everyone; `"exclusive": true` = never sold (Battle Pass or admin only). Starting pieces must stay free.
- Shop (menu → ร้านค้า): every non-free piece by slot; tap to try it on the chibi, buy, wear. The wardrobe shows 🔒 and the price on pieces not owned, and offers to buy them.
- Battle Pass (menu → Battle Pass): `season` in the config: id, name, end date, XP per tier, premium price in gems, and per tier a free and a premium reward (`{ "coins": n }`, `{ "gems": n }` or `{ "item": "fashion:back/wings" }`). Tap a reached reward to claim it. A new season id starts everyone from zero.
- Pay per match (`economy`): coins and XP for a win or a loss, only for matches between two or more accounts that lasted `minTurns` turns, so playing alone against bots can't be farmed.
- The server checks every outfit against what the account owns, every purchase and claim is one conditional update (no double spending or double claims), and every coin and gem in or out is written to the `ledger` table.
- Admin page: price columns on the equipment and fashion tabs, a "รางวัลและ Battle Pass" tab for the economy and the season, and a "ผู้เล่น" tab to look a player up by username and grant coins, gems or a piece (with a reason, logged).

## Admin page (for game masters)

`/admin.html` on the game's site edits the server's config without touching files.

- Sign in with your name and the shared `ADMIN_PASSWORD` (set on the server; without it the page is off). Your name goes into the history.
- Tabs: rules, weapons, skills and items, equipment (with a give/cost balance per piece), fashion, history.
- Changed fields are highlighted; the bar at the bottom lists every change, errors (which block publishing) and warnings.
- Publish saves a new version in the database. New matches use it at once; matches in progress finish on the numbers they started with. If someone else published first you are asked to reload.
- History: load any old version as a draft and publish it again to roll back.

Locally: `ADMIN_PASSWORD=<something> npm run server`, then open http://localhost:5173/admin.html.

## Game config file

Every number and name players see lives in `config/game.json`: rules (`rules`), per-match limits (`limits`), weapons, skills, items and their values, equipment (stats must give and cost the same points) and the fashion list.

1. Edit the file.
2. `npm run check-config`: lists mistakes in Thai and exits non-zero if the file can't be used.
3. Restart the server (on Render: push, or Manual Deploy). Or skip all this and use the admin page below. The server refuses to start with a broken config, and sends its numbers to every client at match start, so online matches always agree. Bot mode uses the numbers built into the game.

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
