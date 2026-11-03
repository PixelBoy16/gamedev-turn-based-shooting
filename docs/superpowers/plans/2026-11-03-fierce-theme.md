# Fierce Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Black Boom's cute look into a tough cartoon one: style-B characters, a renamed tough wardrobe, and a dark steel UI.

**Architecture:** The wardrobe rename is data (config + one rename map that old saves, owned rows and stored admin configs pass through). The drawn character moves its piece drawers into a Phaser-free module so tests can check every catalog piece has a drawing. The UI look is centralised in a theme module (palette + chamfered plate) used by `Button`, `MenuCard` and `confirmBox`; Kanit is bundled and loaded before the game starts.

**Tech Stack:** Phaser 4.2.1, TypeScript, Vite, Vitest, PGlite/pg, `@fontsource/kanit`.

**Spec:** `docs/superpowers/specs/2026-11-03-fierce-theme-design.md`

## Global Constraints

- Style B: cartoon, thick dark outlines, saturated colour, head about 1/3 of the height, broad shoulders, frowning brows, smirk with teeth.
- No realism, no blood, nothing copied from Brawl Stars, DDTank or BoomZ.
- Prices, currencies and Battle Pass places carry over from the piece each new one replaces.
- Battle maps, weapons, physics, balance, shop/pass rules and not-pay-to-win are unchanged.
- Dark UI keeps strong text contrast; text keeps a dark outline.
- Kanit is bundled (`@fontsource/kanit`), never fetched from Google at runtime.
- Drawn character textures keep the feet anchor (origin 0.5, 1) and `lookHand()` keeps its signature.
- Browser storage keys keep the `crater-clash:` prefix.

## Review Focus

1. A tester's saved outfit (localStorage or DB profile) still names old ids (`short`, `bear`…) → they see the renamed piece, not a reset outfit. Test in Task 1.
2. Owned rows for old ids (bought or claimed before the rename) → still owned under the new id; no double reward on claim. Test in Task 1.
3. An admin-published config version stored in the DB still lists the old catalog → on load it shows the new pieces, not the cute ones, and keeps the admin's prices. Test in Task 1.
4. Kanit fails to load (offline, blocked) → the game still starts with the fallback font within 3 s. Checked in Task 3, Step 5.
5. Thai labels in heavier Kanit overflow buttons on the busiest screens (wardrobe, shop, pass, HUD) → no clipped or overlapping text. Checked in Task 4.

---

### Task 1: Rename the wardrobe

**Files:**
- Modify: `config/game.json` (fashion list, season rewards), `src/core/gear.ts`, `server/db.ts`, `server/configStore.ts`, `src/scenes/MenuScene.ts` (showcase looks)
- Test: `tests/config.test.ts`, `tests/accounts.test.ts`, `tests/admin.test.ts`

**Interfaces:**
- Produces: `FASHION_RENAMES: Partial<Record<FashionSlot, Record<string, string>>>` and `renameFashion(slot: FashionSlot, id: string): string` in `src/core/gear.ts`; `renameConfig(cfg: GameConfig, seed: GameConfig): GameConfig` in `server/configStore.ts`.

The map (old → new), names and places from the spec:
hat crown→spikecrown "มงกุฎเหล็กหนาม", beanie→bandana "ผ้าโพกหัว"; glasses round→goggles "แว่นกันลม"; hair short→buzz "ผมเกรียน", bob→mohawk "ทรงโมฮอว์ก"; face blush→warpaint "ลายพรางหน้า", bandaid→scar "แผลเป็น", mustache→beard "เคราดุ"; cloth tee→tank "เสื้อกล้ามทหาร", robe→trench "โค้ทสนาม", dress→vest "เสื้อเกราะเบา"; eyes round→glare "ตาจ้อง", happy→squint "ตาหรี่", star→glow "ตาเรืองแสง"; set bear→bearskull "ชุดกะโหลกหมี"; back wings→ironwings "ปีกเหล็ก", backpack→ammo "เป้กระสุน". Renamed only: cloth armor "เกราะเหล็ก", back cape "ผ้าคลุมขาดวิ่น".

- [ ] **Step 1: Write the failing tests**

`tests/config.test.ts`:
```ts
it('ships the tough wardrobe', () => {
  const ids = BUNDLED.fashion.map((f) => `${f.slot}/${f.id}`);
  for (const old of ['hat/crown', 'hair/short', 'face/blush', 'eyes/star', 'set/bear', 'back/wings', 'cloth/dress']) expect(ids).not.toContain(old);
  for (const now of ['hat/bandana', 'hair/buzz', 'face/warpaint', 'eyes/glow', 'set/bearskull', 'back/ironwings', 'cloth/vest']) expect(ids).toContain(now);
  expect(DEFAULT_LOOK).toMatchObject({ hair: 'buzz', cloth: 'tank', eyes: 'glare' });
  expect(BUNDLED.season.tiers[9].free).toEqual({ item: 'fashion:hat/bandana' });
  expect(BUNDLED.season.tiers[19].premium).toEqual({ item: 'fashion:set/bearskull' });
});
it('reads old saved outfits as the renamed pieces', () => {
  const l = cleanLoadout({ look: { hair: 'short', set: 'bear', eyes: 'star', hat: 'aviator' } });
  expect(l.look).toMatchObject({ hair: 'buzz', set: 'bearskull', eyes: 'glow', hat: 'aviator' });
});
```
`tests/accounts.test.ts`: replace ids in existing tests (robe→trench, bear→bearskull, short→buzz, wings→ironwings), and add:
```ts
it('keeps pieces owned under their old ids', async () => {
  // insert owned rows 'fashion:set/bear' and 'fashion:hat/beanie' straight into the table, then run migrate()
  // expect accounts.get(id).owned to equal ['fashion:set/bearskull', 'fashion:hat/bandana']
});
```
`tests/admin.test.ts`: grant uses `fashion:set/bearskull`, and add:
```ts
it('maps an old published catalog onto the new pieces', () => {
  // stored = clone of seed with fashion ids reverted to the old ones and crown price set to { gems: 99 }
  const out = renameConfig(stored, seed);
  // expect out.fashion to contain hat/spikecrown with price { gems: 99 } and name 'มงกุฎเหล็กหนาม', and no hat/crown
  // expect out.season.tiers[19].premium to equal { item: 'fashion:set/bearskull' }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run`
Expected: the new tests FAIL (old ids still present, `renameConfig` not exported).

- [ ] **Step 3: Implement**

- `config/game.json`: rename ids and names per the map; move season reward items; keep every price and `exclusive` flag.
- `src/core/gear.ts`: `DEFAULT_LOOK` = buzz/tank/glare; add `FASHION_RENAMES` and `renameFashion`; `cleanLoadout` passes each look id through `renameFashion` before the `fashionDef` check.
- `server/db.ts`: append migration 3, one `update owned set item = '<new key>' where item = '<old key>'` per renamed piece.
- `server/configStore.ts`: `renameConfig` maps each stored fashion entry with a renamed id to the seed's entry for the new id, keeping the stored `price`; maps season reward `item` keys; `open()` applies it after the seed merge, before validation.
- `MenuScene` showcase looks use the new ids.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npm run typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit** — `git commit -m "Rename the wardrobe to tough pieces"`

### Task 2: Style-B drawn character

**Files:**
- Create: `src/art/drawnPieces.ts` (every fashion drawer, the head, body and default face; imports Phaser as a type only)
- Modify: `src/art/chibi.ts` (keeps baking, guns, shells, equipment icons; imports the drawers)
- Test: `tests/art.test.ts`

**Interfaces:**
- Consumes: the catalog from Task 1.
- Produces: `DRAWERS: Record<FashionSlot, Record<string, (g: Graphics) => void>>`, `drawBase(g: Graphics): void` (body, head, brows, smirk), `hasDrawing(slot: FashionSlot, id: string): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
it('draws every piece in the catalog', () => {
  for (const f of BUNDLED.fashion) if (f.id !== 'none') expect(hasDrawing(f.slot, f.id), `${f.slot}/${f.id}`).toBe(true);
});
```

- [ ] **Step 2: Run** `npx vitest run tests/art.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** the drawers in style B on the existing 128×148 canvas (feet on the bottom edge): head a rounded square about y 12–80, wide torso and shoulders, fists near y 118 so `lookHand()`'s drawn spot still fits; default face = thick angled brows, narrowed eyes, smirk with teeth. Every new piece id gets a drawer (bearskull: skull-faced bear hood over a dark suit; ironwings: riveted steel wings; glow: bright cyan eyes; warpaint: two dark stripes per cheek; scar: pale X-scar). `chibi.ts` `drawLook` and `pieceTexture` call `DRAWERS`/`drawBase` instead of the local tables.

- [ ] **Step 4: Run** `npx vitest run && npm run typecheck`, then open `http://localhost:5179/?lab` and the wardrobe — Expected: PASS; every piece visible on the body, nothing floating off the head.

- [ ] **Step 5: Commit** — `git commit -m "Draw the character in the tough cartoon style"`

### Task 3: Theme module, plates and Kanit

**Files:**
- Create: `src/ui/theme.ts`
- Modify: `src/ui/widgets.ts`, `src/scenes/MenuScene.ts` (`MenuCard`), `src/main.ts`, `package.json`
- Test: `tests/theme.test.ts`

**Interfaces:**
- Produces: `THEME` (`panel`, `steel`, `fire`, `red`, `gold`, `ink`, `text`, `muted` as numbers/CSS strings), `platePoints(w: number, h: number, cut: number): { x: number; y: number }[]` (8 points, clockwise from top-left after the cut, centred on 0,0), `drawPlate(g: Graphics, w: number, h: number, fill: number, opts?: { cut?: number; rivets?: boolean; selected?: boolean }): void`, and `FONT` now starting with `"Kanit"`.

- [ ] **Step 1: Write the failing test**

```ts
it('cuts the corners of a plate', () => {
  const p = platePoints(200, 100, 16);
  expect(p).toHaveLength(8);
  expect(p[0]).toEqual({ x: -84, y: -50 });
  for (const q of p) { expect(Math.abs(q.x)).toBeLessThanOrEqual(100); expect(Math.abs(q.y)).toBeLessThanOrEqual(50); }
});
it('never cuts more than a third of the short side', () => {
  expect(platePoints(60, 30, 40)[0]).toEqual({ x: -20, y: -15 });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/theme.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** `theme.ts`; `Button.redraw` and `MenuCard` draw with `drawPlate` (default fill `THEME.steel`, selected = fire-orange edge); `confirmBox` panel uses a plate with a fire edge. `npm i @fontsource/kanit@5.2.8` (exact version); import its 400/700/900 CSS in `main.ts` and start the game after `Promise.race([document.fonts.load('900 40px Kanit'), timeout(3000)])`.

- [ ] **Step 4: Run** `npx vitest run && npm run build` — Expected: PASS.

- [ ] **Step 5: Check the font fallback** — block `*kanit*` in the browser's network panel (or rename the font file in `dist`), reload: the menu appears within 3 s in the fallback font.

- [ ] **Step 6: Commit** — `git commit -m "Steel plate theme and Kanit"`

### Task 4: Dusk backdrop and screen pass

**Files:**
- Modify: `src/scenes/backdrop.ts`, `src/scenes/MenuScene.ts` (card colours, logo glow), any scene whose text overflows
- Test: browser screenshots (no unit test: visual)

- [ ] **Step 1: Implement** the dusk grade in `menuBackdrop` (a gradient overlay from dark orange at the horizon to near-black at the top, multiply/alpha, plus 3–4 slow translucent smoke puffs drifting left), skipped when `art-menu-bg` exists. Menu cards: bot = steel, friends = dark blue-steel, ranked = fire red; shop gold, pass dark purple.

- [ ] **Step 2: Screenshot every screen** at 1920×1080 and at a phone-shaped window: menu, wardrobe, lobby, ranked, account, shop, pass, a battle (HUD), the result screen. Expected: no clipped or overlapping Thai text, every button label readable.

- [ ] **Step 3: Fix** what Step 2 found (smaller font size or wider plate), re-screenshot.

- [ ] **Step 4: Run** `npx vitest run && npm run build` — Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "Dusk menu backdrop and screen pass"`

### Task 5: Art guide

**Files:**
- Modify: `README.md` (Art section: the painted-layer list for style B and where files go)

- [ ] **Step 1:** Rewrite the Art section: `body.png` + `<slot>-<id>.png` per new id (hair `-back`/`-front`, set `-body`/`-hood`), `menu-bg.jpg` dusk battlefield, `logo.png`, menu icons; note old chibi layers no longer match.
- [ ] **Step 2: Commit** — `git commit -m "Art guide for the tough style"`
