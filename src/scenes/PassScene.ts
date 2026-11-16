import Phaser from 'phaser';
import { equipTexture, pieceTexture } from '../art/chibi';
import { Reward, currentConfig } from '../core/config';
import { EquipSlot, FashionSlot } from '../core/gear';
import { Track, claimKey, itemName, parseItemKey, seasonOver, tierOf } from '../core/shop';
import { account } from '../net/account';
import { offerBox } from '../ui/modals';
import { FONT, fit, label } from '../ui/widgets';
import { Box, PlateButton, STROKE, filled, fitted, mockupBox, placed, walletBar } from '../ui/plates';

/** Where each piece sits in the designer's 1672x941 mockup (new_ui/black-boom-pass-parts 2/layout.json). */
const box = (b: Box): Box => mockupBox(b, 1672);
const P = (name: string) => `ui-pass/${name}`;
const K = 1920 / 1672;

/** Tier columns on screen at once. */
const COLS = 9;
/** Mockup x of the first column, and the step between columns. */
const COL_X = 267;
const COL_STEP = 153;
/** The XP bar's inner track (mockup px), where the fill and its ball run. */
const TRACK: Box = [279, 194, 862, 40];
/** Rewards with a painted picture of their own in the drop. */
const ITEM_ART: Record<string, string> = { 'fashion:glasses/shades': 'sunglasses' };

const text = (scene: Phaser.Scene, str: string, size: number, color = '#ffffff', stroke = 5) =>
  scene.add.text(0, 0, str, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: STROKE, strokeThickness: stroke });

/**
 * The season's Battle Pass, built to the painted mockup (new_ui/black-boom-pass-parts 2):
 * XP from matches climbs the tiers; each tier has a free reward and a premium one (premium
 * bought with gems). Nine tiers show at a time (arrows or a swipe page through the rest);
 * tap a reward that is ready to claim it.
 */
export default class PassScene extends Phaser.Scene {
  /** Index of the first tier column shown. */
  private first = 0;
  private busy = false;
  /** Rebuilt on every render: level, XP, unlock button, the tier columns. */
  private ui: Phaser.GameObjects.GameObject[] = [];
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super('pass');
  }

  create(): void {
    this.ui = [];
    const bg = this.add.image(960, 540, P('bg'));
    bg.setScale(Math.max(1920 / bg.width, 1080 / bg.height));
    this.chrome();
    filled(this, P('panel'), box([28, 324, 1625, 480]));
    this.tracks();
    this.pager();
    placed(this, P('crate'), box([321, 849, 195, 184])).setDepth(5);
    placed(this, P('ammo-crate'), box([1144, 812, 325, 249])).setDepth(5);
    placed(this, P('skull-canister'), box([1504, 776, 168, 156])).setDepth(5);
    this.hint = label(this, 960, 1010, '', 30, '#ffd166').setOrigin(0.5).setDepth(10);
    // start on the page holding the next tier to reach
    const t = account.view ? tierOf(account.view.pass.xp) : 0;
    this.first = this.clamp(Math.floor(t / COLS) * COLS);
    // a sideways swipe over the rewards turns the page
    let downX: number | null = null;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      downX = p.y > 340 && p.y < 920 ? p.x : null;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (downX !== null && Math.abs(p.x - downX) > 120) this.turn(p.x < downX ? 1 : -1);
      downX = null;
    });
    const stop = account.onChange(() => this.render());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      stop();
      this.ui = [];
    });
    void account.ensure().then(() => this.render());
    this.render();
  }

  private say(msg: string): void {
    this.hint.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.hint);
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 2500, duration: 400 });
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.ui.push(o);
    return o;
  }

  private clamp(i: number): number {
    return Math.max(0, Math.min(currentConfig().season.tiers.length - COLS, i));
  }

  private turn(dir: number): void {
    const next = this.clamp(this.first + dir * COLS);
    if (next === this.first) return;
    this.first = next;
    this.render();
  }

  // ---------------------------------------------------------------- built once

  /** Back, the ticket title over its burst, the season strip, wallet and the menu button. */
  private chrome(): void {
    const back = new PlateButton(this, 'ui-ranked/btn-back', box([18, 18, 99, 77]), () => this.scene.start('menu'));
    back.put(fitted(this, 'ui-ranked/ico-back', back.w * 0.5, back.h * 0.56), 0.5, 0.5);
    filled(this, P('burst'), box([158, 0, 616, 106]));
    filled(this, P('season'), box([242, 96, 490, 54]));
    placed(this, P('calendar'), box([284, 103, 40, 39]));
    const title = (str: string, b: Box, color: string, size: number) => {
      const [x, y, w, h] = box(b);
      const t = this.add.text(x, y + h / 2, str, {
        fontFamily: '"Arial Black", "Arial Bold", Arial, sans-serif', fontSize: `${size}px`, fontStyle: 'bold italic',
        color, stroke: STROKE, strokeThickness: 10, padding: { x: 8, y: 4 },
      }).setOrigin(0, 0.5);
      return fit(t, w + 16, h + 8);
    };
    const battle = title('Battle', [273, 15, 235, 78], '#ffffff', 76);
    title('Pass', [battle.x / K + battle.displayWidth / K - 6, 8, 192, 83], '#ffe65b', 82);
    placed(this, P('ticket'), box([140, 14, 138, 120]));
    walletBar(this);

    const menu = new PlateButton(this, P('btn-menu'), box([41, 820, 266, 94]), () => this.scene.start('menu'));
    menu.put(fitted(this, 'ui-ranked/ico-back', menu.w * 0.17, menu.h * 0.5), 0.33, 0.5);
    menu.put(fit(text(this, 'เมนู', 44, '#ffffff', 7).setOrigin(0, 0.5), menu.w * 0.42, menu.h * 0.7), 0.46, 0.5);
  }

  /** The two row labels at the left: free (silver star) and premium (gold crown). */
  private tracks(): void {
    filled(this, P('track-free'), box([54, 380, 207, 181]));
    placed(this, P('track-free-icon'), box([91, 403, 135, 84]));
    const [fx, fy, fw, fh] = box([85, 486, 147, 49]);
    fit(text(this, 'ฟรี', 46, '#ffffff', 8).setOrigin(0.5).setPosition(fx + fw / 2, fy + fh / 2), fw, fh);
    filled(this, P('track-premium'), box([54, 581, 207, 196]));
    placed(this, P('track-premium-icon'), box([77, 594, 167, 105]));
    const [px, py, pw, ph] = box([75, 698, 167, 50]);
    fit(text(this, 'พรีเมียม', 42, '#fff5c3', 8).setOrigin(0.5).setPosition(px + pw / 2, py + ph / 2), pw, ph);
  }

  /** ‹ and › on the panel's sides. */
  private pager(): void {
    const prev = new PlateButton(this, P('btn-page'), box([14, 528, 64, 102]), () => this.turn(-1)).setDepth(4);
    prev.put(fitted(this, P('chevron-left'), prev.w * 0.6, prev.h * 0.4), 0.5, 0.48);
    const next = new PlateButton(this, P('btn-page'), box([1603, 528, 64, 102]), () => this.turn(1)).setDepth(4);
    next.put(fitted(this, P('chevron-right'), next.w * 0.6, next.h * 0.4), 0.5, 0.48);
    // dim an arrow with nothing past it
    this.events.on('pass-render', () => {
      prev.setEnabled(this.first > 0);
      next.setEnabled(this.first < this.clamp(Infinity));
    });
  }

  // ---------------------------------------------------------------- per render

  private render(): void {
    if (!this.sys.isActive()) return;
    for (const o of this.ui) o.destroy();
    this.ui = [];
    const season = currentConfig().season;
    const me = account.view;
    const xp = me?.pass.xp ?? 0;
    const tier = tierOf(xp);
    const maxed = tier >= season.tiers.length;
    const into = maxed ? season.xpPerTier : xp - tier * season.xpPerTier;
    const over = seasonOver();
    const days = Math.max(0, Math.ceil((Date.parse(season.endsAt) - Date.now()) / 86_400_000));

    this.season(season.name, over, days);
    this.level(tier, season.tiers.length);
    this.xpBar(into, season.xpPerTier, maxed);
    this.unlock(season.premiumGems, !!me?.pass.premium, over);

    for (let c = 0; c < COLS; c++) {
      const n = this.first + c + 1;
      const t = season.tiers[n - 1];
      if (!t) continue;
      const tb = box([COL_X + c * COL_STEP + 15, 306, 116, 58]);
      this.keep(filled(this, P('tier'), tb));
      const [tx, ty, tw, th] = tb;
      this.keep(fit(text(this, String(n), 40, n <= tier ? '#ffe65b' : '#ffffff', 6).setOrigin(0.5).setPosition(tx + tw / 2, ty + th / 2 + 2), tw * 0.6, th * 0.8));
      for (const track of ['free', 'premium'] as Track[]) {
        const r = t[track];
        if (r) this.card(n, c, track, r, tier);
      }
    }
    this.events.emit('pass-render');
  }

  /** "ซีซัน 1: หลุมแรก · เหลือ 81 วัน" on its strip, the days in yellow. */
  private season(name: string, over: boolean, days: number): void {
    const [sx, sy, sw, sh] = box([336, 102, 370, 40]);
    const head = this.keep(text(this, `${name} · ${over ? 'จบแล้ว' : 'เหลือ'}`, 30, '#ffffff', 5).setOrigin(0, 0.5).setPosition(sx, sy + sh / 2));
    const tail = over ? null : this.keep(text(this, ` ${days} วัน`, 32, '#ffff3f', 5).setOrigin(0, 0.5).setPosition(sx, sy + sh / 2));
    const k = Math.min(1, sw / (head.width + (tail?.width ?? 0)));
    head.setScale(k);
    tail?.setScale(k).setX(sx + head.width * k);
  }

  /** The gold winged badge: Lv. and tier / tiers. */
  private level(tier: number, tiers: number): void {
    this.keep(filled(this, P('badge'), box([45, 144, 204, 168])));
    const [lx, ly, lw, lh] = box([110, 170, 80, 41]);
    this.keep(fit(text(this, 'Lv.', 36, '#ffffff', 6).setOrigin(0.5).setPosition(lx + lw / 2, ly + lh / 2), lw, lh));
    const [nx, ny, nw, nh] = box([78, 210, 136, 56]);
    this.keep(fit(text(this, `${tier}/${tiers}`, 54, '#ffffff', 7).setOrigin(0.5).setPosition(nx + nw / 2, ny + nh / 2), nw, nh));
  }

  /** The rail with its gold fill, the ball at the fill's end, XP numbers and how to earn more. */
  private xpBar(into: number, per: number, maxed: boolean): void {
    this.keep(filled(this, P('rail'), box([262, 181, 894, 66])));
    const [x, y, w, h] = box(TRACK);
    const fw = Math.max(h, (w * into) / per);
    if (into > 0) this.keep(this.add.image(x, y + h / 2, P('fill')).setOrigin(0, 0.5).setDisplaySize(fw, h));
    this.keep(this.add.image(x + fw - h / 2, y + h / 2, P('orb')).setDisplaySize(h, h));
    const [vx, vy, vw, vh] = box([900, 196, 215, 34]);
    this.keep(fit(text(this, maxed ? 'ครบทุกขั้นแล้ว' : `${into}/${per} XP`, 34, '#ffffff', 6).setOrigin(1, 0.5).setPosition(vx + vw, vy + vh / 2), vw, vh + 6));
    this.keep(filled(this, P('hint-base'), box([269, 244, 879, 49])));
    this.keep(placed(this, P('xp'), box([288, 249, 40, 40])));
    const [hx, hy, hw, hh] = box([338, 250, 790, 33]);
    this.keep(fit(text(this, 'ได้ XP จากการเล่นกับผู้เล่นจริง: ชนะ 100 · แพ้ 50', 28, '#ffffff', 5).setOrigin(0, 0.5).setPosition(hx, hy + hh / 2), hw, hh + 4));
  }

  /** The purple unlock button with the crown, or what it says once bought. */
  private unlock(gems: number, premium: boolean, over: boolean): void {
    const btn = this.keep(new PlateButton(this, P('btn-unlock'), box([1176, 174, 457, 105]), () => {
      if (premium) return this.say('ปลดล็อกพรีเมียมแล้ว รับรางวัลแถวล่างได้เลย');
      if (over) return this.say('ซีซันนี้จบแล้ว');
      if (!account.view) return this.say('ต้องต่อเซิร์ฟเวอร์ก่อนถึงจะปลดล็อกได้');
      offerBox(this, {
        title: 'ปลดล็อก Battle Pass', tag: 'พรีเมียม', about: 'ปลดล็อกรางวัลพิเศษตลอดซีซัน', price: { gems }, yes: 'ปลดล็อก', crest: true,
        onYes: () => {
          account.buyPass().then(() => this.say('ปลดล็อกพรีเมียมแล้ว รับรางวัลขั้นที่ผ่านมาได้เลย')).catch((e: Error) => this.say(e.message));
        },
      });
    }));
    btn.put(fitted(this, P('crown'), btn.w * 0.17, btn.h * 0.66), 0.135, 0.5);
    if (premium || over) {
      btn.put(fit(text(this, premium ? 'พรีเมียมแล้ว' : 'ซีซันจบแล้ว', 40, '#ffffff', 7).setOrigin(0.5), btn.w * 0.66, btn.h * 0.6), 0.6, 0.48);
      return;
    }
    const words = fit(text(this, `ปลดล็อกพรีเมียม ${gems}`, 38, '#ffffff', 7).setOrigin(0, 0.5), btn.w * 0.6, btn.h * 0.6);
    const gem = fitted(this, 'ui-ico-gem', btn.h * 0.5, btn.h * 0.5);
    // words and gem centred together in the space right of the crown
    const total = words.displayWidth + 8 + gem.displayWidth;
    const left = btn.w * 0.25 + (btn.w * 0.71 - total) / 2;
    btn.putAt(words, left, btn.h * 0.48);
    btn.putAt(gem, left + words.displayWidth + 8 + gem.displayWidth / 2, btn.h * 0.48);
    this.keep(placed(this, P('emphasis'), box([1563, 137, 91, 63])));
  }

  /**
   * One reward: its picture and what it is on the free (navy) or premium (purple) card, then
   * a lock until it can be had, "รับเลย!" while it waits to be claimed, or the green tick once claimed.
   */
  private card(n: number, col: number, track: Track, r: Reward, tier: number): void {
    const me = account.view;
    const mx = COL_X + col * COL_STEP;
    const b = track === 'free' ? box([mx, 379, 151, 188]) : box([mx, 581, 151, 195]);
    const claimed = !!me?.pass.claimed.includes(claimKey(n, track));
    const reached = n <= tier;
    const unlocked = reached && (track === 'free' || !!me?.pass.premium);
    const ready = !!me && unlocked && !claimed && !seasonOver();
    const card = this.keep(new PlateButton(this, P(`card-${track}`), b, () => this.claim(n, track, r, { ready, claimed, reached })));
    const pic = this.picture(r, track);
    if (pic) card.put(fitted(this, pic, card.w * 0.62, card.h * 0.34), 0.5, 0.3);
    card.put(fit(text(this, rewardName(r), 28, '#ffffff', 5).setOrigin(0.5), card.w * 0.86, card.h * 0.18), 0.5, 0.635);
    if (claimed) {
      card.base.setTint(0x8c92aa);
      card.put(fitted(this, P('claimed'), card.w * 0.42, card.w * 0.42), 0.5, 0.84);
    } else if (ready) {
      const go = text(this, 'รับเลย!', 30, '#ffe65b', 6).setOrigin(0.5);
      card.put(go, 0.5, 0.85);
      card.glint(col * 90);
      this.tweens.add({ targets: go, scale: 1.12, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      card.put(fitted(this, P('lock'), card.w * 0.2, card.h * 0.15), 0.5, 0.85);
    }
  }

  /** The painted coins, gem or piece for a reward. */
  private picture(r: Reward, track: Track): string | null {
    if ('coins' in r) return P(track === 'free' ? 'silver-coins' : 'gold-coins');
    if ('gems' in r) return 'ui-ico-gem';
    if (ITEM_ART[r.item]) return P(ITEM_ART[r.item]);
    const k = parseItemKey(r.item);
    if (!k) return null;
    return k.kind === 'fashion' ? pieceTexture(this, k.slot as FashionSlot, k.id) : equipTexture(this, k.slot as EquipSlot, k.id);
  }

  private claim(tier: number, track: Track, r: Reward, s: { ready: boolean; claimed: boolean; reached: boolean }): void {
    if (!account.view) return this.say('ต้องต่อเซิร์ฟเวอร์ก่อนถึงจะรับรางวัลได้');
    if (s.claimed) return this.say('รับรางวัลนี้ไปแล้ว');
    if (!s.reached) return this.say(`เล่นให้ถึงขั้น ${tier} ก่อน`);
    if (!s.ready) return this.say(track === 'premium' ? 'ต้องปลดล็อกพรีเมียมก่อน' : 'ซีซันนี้จบแล้ว');
    if (this.busy) return;
    this.busy = true;
    account.claim(tier, track)
      .then(() => this.say(`ได้ ${rewardName(r)} แล้ว`))
      .catch((e: Error) => this.say(e.message))
      .finally(() => {
        this.busy = false;
      });
  }
}

function rewardName(r: Reward): string {
  return 'coins' in r ? `${r.coins} เหรียญ` : 'gems' in r ? `${r.gems} เพชร` : itemName(r.item);
}
