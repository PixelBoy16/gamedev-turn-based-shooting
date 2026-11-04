import Phaser from 'phaser';
import { ART_SCALE, equipTexture, lookRes, lookTexture, pieceTexture } from '../art/chibi';
import {
  EQUIPMENT, EQUIP_SLOT_NAME, EquipSlot, FASHION, FASHION_SLOTS, FASHION_SLOT_NAME, FashionSlot, STAT_NAME, Stats, copyLoadout,
} from '../core/gear';
import { ItemKind, itemKey, owns, priceOf, priceText } from '../core/shop';
import { account } from '../net/account';
import { Button, FONT, INK, confirmBox, fit, label, walletText } from '../ui/widgets';
import { menuBackdrop } from './backdrop';
import { loadSetup, saveSetup } from './setup';

type Tab = FashionSlot | 'equip';

interface Piece {
  kind: ItemKind;
  slot: string;
  id: string;
  name: string;
  exclusive: boolean;
  body: string;
}

/**
 * The shop: everything that isn't free, by slot. Tap a piece to try it on the chibi,
 * buy it, then wear it. Equipment is sold for coins only.
 */
export default class ShopScene extends Phaser.Scene {
  private ui: Phaser.GameObjects.GameObject[] = [];
  private tab: Tab = 'hat';
  private trying: Piece | null = null;
  private hint!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super('shop');
  }

  create(): void {
    this.trying = null;
    menuBackdrop(this);
    const shade = this.add.graphics();
    shade.fillStyle(0x10162a, 0.6);
    shade.fillRect(0, 0, 1920, 1080);
    label(this, 60, 24, 'ร้านค้า', 56, '#ffd166');
    this.hint = label(this, 960, 1040, '', 28, '#ffd166').setOrigin(0.5);
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

  private add_<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.ui.push(o);
    return o;
  }

  private pieces(): Piece[] {
    if (this.tab === 'equip') {
      return EQUIPMENT.filter((e) => e.price).map((e) => ({
        kind: 'equip' as const, slot: e.slot, id: e.id, name: e.name, exclusive: false,
        body: `${EQUIP_SLOT_NAME[e.slot]}\n${(Object.keys(e.stats) as (keyof Stats)[]).map((k) => `${STAT_NAME[k]}\u00a0${e.stats[k]! > 0 ? '+' : ''}${e.stats[k]}${k === 'hp' ? '' : '%'}`).join(' ')}`,
      }));
    }
    return FASHION.filter((f) => f.slot === this.tab && (f.price || f.exclusive)).map((f) => ({
      kind: 'fashion' as const, slot: f.slot, id: f.id, name: f.name, exclusive: !!f.exclusive, body: '',
    }));
  }

  private texture(p: Piece): string | null {
    return p.kind === 'fashion' ? pieceTexture(this, p.slot as FashionSlot, p.id) : equipTexture(this, p.slot as EquipSlot, p.id);
  }

  private render(): void {
    if (!this.sys.isActive()) return;
    for (const o of this.ui) o.destroy();
    this.ui = [];
    const me = account.view;
    this.add_(label(this, 1860, 36, me ? walletText(me.coins, me.gems) : 'ออฟไลน์: ซื้อของไม่ได้', 32).setOrigin(1, 0));
    this.add_(new Button(this, 200, 990, 260, 90, '← เมนู', { size: 34, onClick: () => this.scene.start('menu') }));

    // tabs
    const tabs: Tab[] = [...FASHION_SLOTS.filter((s) => FASHION.some((f) => f.slot === s && (f.price || f.exclusive))), 'equip'];
    tabs.forEach((t, i) => {
      const b = this.add_(new Button(this, 640 + i * 150, 150, 140, 64, t === 'equip' ? 'อุปกรณ์' : FASHION_SLOT_NAME[t], {
        size: 24, onClick: () => {
          this.tab = t;
          this.render();
        },
      }));
      b.setSelected(t === this.tab);
    });

    // the chibi, trying on the selected piece over the current outfit
    const card = this.add_(this.add.graphics());
    card.fillStyle(INK, 0.85);
    card.fillRoundedRect(60, 120, 460, 820, 28);
    const setup = loadSetup(this.registry);
    const look = copyLoadout(setup.loadout);
    if (this.trying?.kind === 'fashion') {
      look.look[this.trying.slot as FashionSlot] = this.trying.id;
    }
    this.add_(this.add.image(290, 620, lookTexture(this, look)).setOrigin(0.5, 1).setScale(ART_SCALE * 2.6 * lookRes()));
    if (this.trying) this.preview(this.trying, setup);
    else this.add_(label(this, 290, 700, 'แตะของเพื่อลองใส่', 28, '#cfd8ff').setOrigin(0.5, 0));

    // the pieces of this tab
    const list = this.pieces();
    const owned = account.owned();
    list.forEach((p, i) => {
      const x = 680 + (i % 5) * 240;
      const y = 380 + Math.floor(i / 5) * 330;
      const has = owns(owned, p.kind, p.slot, p.id);
      const price = priceOf(p.kind, p.slot, p.id);
      const b = this.add_(new Button(this, x, y, 220, 300, '', {
        radius: 18, onClick: () => {
          this.trying = p;
          this.render();
        },
      }));
      b.setSelected(this.trying?.kind === p.kind && this.trying.slot === p.slot && this.trying.id === p.id);
      const key = this.texture(p);
      // picture, name, details, price: each in its own band so long Thai text never runs into the next
      if (key) {
        const img = this.add.image(0, -72, key);
        img.setScale(110 / Math.max(img.width, img.height));
        b.add(img);
      }
      b.add(fit(label(this, 0, -6, p.name, 24).setOrigin(0.5, 0), 196, 36));
      if (p.body) {
        b.add(fit(this.add.text(0, 34, p.body, {
          fontFamily: FONT, fontSize: '17px', color: '#cfd8ff', align: 'center', wordWrap: { width: 196 }, lineSpacing: -2,
        }).setOrigin(0.5, 0), 200, 74));
      }
      const tag = has ? '✓ มีแล้ว' : p.exclusive || !price ? 'Battle Pass' : priceText(price);
      b.add(fit(label(this, 0, 140, tag, 24, has ? '#7CFC9A' : '#ffd166').setOrigin(0.5, 1), 196, 34));
    });
    if (!list.length) this.add_(label(this, 1200, 480, 'ไม่มีของขายในหมวดนี้', 30).setOrigin(0.5));
  }

  /** Name, price and the buy / wear button under the chibi. */
  private preview(p: Piece, setup: ReturnType<typeof loadSetup>): void {
    const has = owns(account.owned(), p.kind, p.slot, p.id);
    const price = priceOf(p.kind, p.slot, p.id);
    this.add_(label(this, 290, 660, p.name, 34, '#ffd166').setOrigin(0.5, 0));
    if (p.kind === 'equip') this.add_(label(this, 290, 712, p.body.split('\n')[1], 24, '#cfd8ff').setOrigin(0.5, 0));
    if (has) {
      const wearing = p.kind === 'fashion' ? setup.loadout.look[p.slot as FashionSlot] === p.id : setup.loadout.equip[p.slot as EquipSlot] === p.id;
      this.add_(new Button(this, 290, 840, 360, 96, wearing ? 'ใส่อยู่' : 'ใส่เลย', {
        fill: 0x2f9e44, size: 36, onClick: () => {
          if (p.kind === 'fashion') setup.loadout.look[p.slot as FashionSlot] = p.id;
          else setup.loadout.equip[p.slot as EquipSlot] = p.id;
          saveSetup(this.registry, setup);
          this.render();
        },
      }));
      return;
    }
    if (!price) {
      this.add_(label(this, 290, 820, 'ได้จาก Battle Pass เท่านั้น', 28, '#cfd8ff').setOrigin(0.5));
      return;
    }
    this.add_(new Button(this, 290, 840, 360, 96, `ซื้อ ${priceText(price)}`, {
      fill: price.gems ? 0x7b4fd6 : 0xe0a400, size: 32, onClick: () => {
        if (!account.view) return this.say('ต้องต่อเซิร์ฟเวอร์ก่อนถึงจะซื้อได้');
        if (this.busy) return;
        confirmBox(this, `ซื้อ ${p.name}\n${priceText(price)}`, 'ซื้อ', () => {
          this.busy = true;
          account.buy(itemKey(p.kind, p.slot, p.id))
            .then(() => this.say(`ได้ ${p.name} แล้ว`))
            .catch((err: Error) => this.say(err.message))
            .finally(() => {
              this.busy = false;
            });
        });
      },
    }));
  }
}
