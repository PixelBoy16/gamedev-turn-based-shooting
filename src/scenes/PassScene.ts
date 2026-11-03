import Phaser from 'phaser';
import { equipTexture, pieceTexture } from '../art/chibi';
import { Reward, currentConfig } from '../core/config';
import { EquipSlot, FashionSlot } from '../core/gear';
import { Track, claimKey, parseItemKey, rewardText, seasonOver, tierOf } from '../core/shop';
import { account } from '../net/account';
import { Button, INK, confirmBox, label, walletText } from '../ui/widgets';
import { menuBackdrop } from './backdrop';

const COL = 170; // width of one tier column
const STRIP_X = 330; // where tier 1 starts
const STRIP_W = 1540; // visible width of the tier strip

/**
 * The season's Battle Pass: XP from matches climbs the tiers; each tier has a free
 * reward and a premium one (premium track bought with gems). Rewards are claimed by
 * tapping them. Swipe or use the arrows to scroll the tiers.
 */
export default class PassScene extends Phaser.Scene {
  private ui: Phaser.GameObjects.GameObject[] = [];
  private hint!: Phaser.GameObjects.Text;
  private scroll = 0;
  private busy = false;
  private strip: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('pass');
  }

  create(): void {
    menuBackdrop(this);
    const shade = this.add.graphics();
    shade.fillStyle(0x10162a, 0.6);
    shade.fillRect(0, 0, 1920, 1080);
    this.hint = label(this, 960, 1040, '', 28, '#ffd166').setOrigin(0.5);
    const stop = account.onChange(() => this.render());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      stop();
      this.ui = [];
      this.strip = null;
    });
    // drag the strip sideways (touch-friendly)
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.strip || p.y < 380 || p.y > 900) return;
      this.scrollBy(p.prevPosition.x - p.x);
    });
    // start where the player is
    const t = account.view ? tierOf(account.view.pass.xp) : 0;
    this.scroll = this.clamp((t - 3) * COL);
    void account.ensure().then(() => this.render());
    this.render();
  }

  private say(msg: string): void {
    this.hint.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.hint);
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 2500, duration: 400 });
  }

  private add_<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.ui.push(o);
    return o;
  }

  private clamp(x: number): number {
    const max = Math.max(0, currentConfig().season.tiers.length * COL - STRIP_W);
    return Math.max(0, Math.min(max, x));
  }

  private scrollBy(dx: number): void {
    this.scroll = this.clamp(this.scroll + dx);
    this.strip?.setX(STRIP_X - this.scroll);
  }

  private render(): void {
    if (!this.sys.isActive()) return;
    for (const o of this.ui) o.destroy();
    this.ui = [];
    const season = currentConfig().season;
    const me = account.view;
    const over = seasonOver();
    const days = Math.max(0, Math.ceil((Date.parse(season.endsAt) - Date.now()) / 86_400_000));

    this.add_(label(this, 60, 24, 'Battle Pass', 56, '#ffd166'));
    this.add_(label(this, 60, 100, `${season.name} · ${over ? 'จบแล้ว' : `เหลือ ${days} วัน`}`, 30));
    this.add_(label(this, 1860, 36, me ? walletText(me.coins, me.gems) : '', 32).setOrigin(1, 0));
    this.add_(new Button(this, 200, 990, 260, 90, '← เมนู', { size: 34, onClick: () => this.scene.start('menu') }));
    if (!me) {
      this.add_(label(this, 960, 500, 'ต่อเซิร์ฟเวอร์ไม่ได้', 34).setOrigin(0.5));
      return;
    }

    // level and XP bar
    const tier = tierOf(me.pass.xp);
    const maxed = tier >= season.tiers.length;
    const into = maxed ? season.xpPerTier : me.pass.xp - tier * season.xpPerTier;
    this.add_(label(this, 60, 170, `ขั้น ${tier} / ${season.tiers.length}`, 40, '#ffffff'));
    const bar = this.add_(this.add.graphics());
    bar.fillStyle(0x1b2030, 1);
    bar.fillRoundedRect(330, 180, 900, 36, 18);
    bar.fillStyle(0xffd166, 1);
    bar.fillRoundedRect(330, 180, Math.max(36, (900 * into) / season.xpPerTier), 36, 18);
    this.add_(label(this, 1250, 180, maxed ? 'ครบทุกขั้นแล้ว' : `${into} / ${season.xpPerTier} XP`, 26));
    this.add_(label(this, 330, 230, 'ได้ XP จากการเล่นกับผู้เล่นจริง: ชนะ 100 · แพ้ 50', 22, '#cfd8ff'));

    if (me.pass.premium) this.add_(label(this, 1860, 180, '★ พรีเมียม', 34, '#e2b6ff').setOrigin(1, 0));
    else if (!over) {
      this.add_(new Button(this, 1700, 200, 340, 80, `ปลดล็อกพรีเมียม ${season.premiumGems} 💎`, {
        fill: 0x7b4fd6, size: 26, onClick: () => confirmBox(this, `ปลดล็อก Battle Pass พรีเมียม\n${season.premiumGems} เพชร`, 'ปลดล็อก', () => {
          account.buyPass().then(() => this.say('ปลดล็อกพรีเมียมแล้ว รับรางวัลขั้นที่ผ่านมาได้เลย')).catch((e: Error) => this.say(e.message));
        }),
      }));
    }

    // track names on the left
    const card = this.add_(this.add.graphics());
    card.fillStyle(INK, 0.85);
    card.fillRoundedRect(40, 300, 1840, 640, 28);
    this.add_(label(this, 180, 470, 'ฟรี', 36).setOrigin(0.5));
    this.add_(label(this, 180, 760, 'พรีเมียม', 36, '#e2b6ff').setOrigin(0.5));

    // the tiers, clipped to the strip
    const strip = this.add_(this.add.container(STRIP_X - this.scroll, 0));
    this.strip = strip;
    const mask = this.make.graphics({}, false);
    mask.fillRect(STRIP_X - 10, 300, STRIP_W + 10, 640);
    strip.setMask(mask.createGeometryMask());
    season.tiers.forEach((t, i) => {
      const n = i + 1;
      const x = i * COL + COL / 2;
      const reached = n <= tier;
      strip.add(label(this, x, 320, String(n), 30, reached ? '#ffd166' : '#5d6a8f').setOrigin(0.5, 0));
      for (const track of ['free', 'premium'] as Track[]) {
        const r = t[track];
        if (r) strip.add(this.rewardCard(x, track === 'free' ? 520 : 800, n, track, r, reached));
      }
    });
    this.add_(new Button(this, 290, 640, 64, 120, '‹', { size: 48, onClick: () => this.scrollBy(-COL * 4) }).setDepth(5));
    this.add_(new Button(this, 1850, 640, 64, 120, '›', { size: 48, onClick: () => this.scrollBy(COL * 4) }).setDepth(5));
  }

  private rewardCard(x: number, y: number, tier: number, track: Track, r: Reward, reached: boolean): Phaser.GameObjects.Container {
    const me = account.view!;
    const claimed = me.pass.claimed.includes(claimKey(tier, track));
    const unlocked = reached && (track === 'free' || me.pass.premium);
    const ready = unlocked && !claimed && !seasonOver();
    const b = new Button(this, x, y, COL - 16, 230, '', {
      radius: 16, fill: track === 'premium' ? 0x3b2a63 : undefined, onClick: () => this.claim(tier, track, r, ready, claimed, reached),
    });
    if (ready) b.setSelected(true);
    if (!unlocked && !claimed) b.setAlpha(0.6);
    const icon = this.rewardIcon(r);
    if (icon) {
      const img = this.add.image(0, -40, icon);
      img.setScale(90 / Math.max(img.width, img.height));
      b.add(img);
    } else b.add(label(this, 0, -40, 'coins' in r ? '🪙' : '💎', 56).setOrigin(0.5));
    b.add(this.add.text(0, 30, rewardText(r), {
      fontFamily: 'system-ui, "Noto Sans Thai", sans-serif', fontSize: '20px', color: '#ffffff', align: 'center', wordWrap: { width: COL - 30 },
    }).setOrigin(0.5, 0));
    b.add(label(this, 0, 108, claimed ? '✓ รับแล้ว' : ready ? 'แตะเพื่อรับ' : unlocked ? '' : '🔒', 20, claimed ? '#7CFC9A' : '#ffd166').setOrigin(0.5, 1));
    return b;
  }

  private rewardIcon(r: Reward): string | null {
    if (!('item' in r)) return null;
    const k = parseItemKey(r.item);
    if (!k) return null;
    return k.kind === 'fashion' ? pieceTexture(this, k.slot as FashionSlot, k.id) : equipTexture(this, k.slot as EquipSlot, k.id);
  }

  private claim(tier: number, track: Track, r: Reward, ready: boolean, claimed: boolean, reached: boolean): void {
    if (claimed) return this.say('รับรางวัลนี้ไปแล้ว');
    if (!reached) return this.say(`เล่นให้ถึงขั้น ${tier} ก่อน`);
    if (!ready) return this.say(track === 'premium' ? 'ต้องปลดล็อกพรีเมียมก่อน' : 'ซีซันนี้จบแล้ว');
    if (this.busy) return;
    this.busy = true;
    account.claim(tier, track)
      .then(() => this.say(`ได้ ${rewardText(r)} แล้ว`))
      .catch((e: Error) => this.say(e.message))
      .finally(() => {
        this.busy = false;
      });
  }
}
