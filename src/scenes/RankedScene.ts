import Phaser from 'phaser';
import { lookTexture } from '../art/chibi';
import { account } from '../net/account';
import { net } from '../net/NetClient';
import { ServerMsg } from '../net/protocol';
import { Box, PlateButton, STROKE, filled, fitted, mockupBox, placed, walletBar } from '../ui/plates';
import { Button, FONT, fit } from '../ui/widgets';
import { loadSetup } from './setup';

/** Where each piece sits in the designer's 1671x941 mockup (new_ui/black-boom-ranked-parts/layout.json). */
const box = (b: Box): Box => mockupBox(b, 1671);
const R = (name: string) => `ui-ranked/${name}`;


/** Centre and widest extent of the big button's text, as fractions of the button face. */
const MATCH_TEXT = { x: 0.64, w: 0.5 };

const RULES = 'จับคู่ 1 ต่อ 1 กับผู้เล่นฝีมือใกล้เคียง   •   ไม่ใช้ค่าจากอุปกรณ์ วัดกันที่ฝีมือ';

/**
 * Ranked 1v1: wait in the server's queue for a player of similar rating; the match
 * starts by itself. Also where a ranked match in progress is resumed or forfeited.
 * Built to the painted mockup: the player (in their own outfit) and rating on a big
 * panel under a trophy, one big "find opponent" button, two painted fighters either side.
 * The screen is built once; render() only swaps texts and which buttons show.
 */
export default class RankedScene extends Phaser.Scene {
  private waitingSince = 0;
  private asked = false;
  private error = '';
  private handler = (msg: ServerMsg) => this.onNet(msg);
  private statusHandler = () => this.render();
  private stopAccount: (() => void) | null = null;

  private name!: Phaser.GameObjects.Text;
  private ratingLabel!: Phaser.GameObjects.Text;
  private score!: Phaser.GameObjects.Text;
  private ratingTrophy!: Phaser.GameObjects.Image;
  private ratingPlate!: Phaser.GameObjects.Image;
  private rules!: Phaser.GameObjects.Text;
  private rulesW = 0;
  private match!: PlateButton;
  private matchIcon!: Phaser.GameObjects.Image;
  private matchTitle!: Phaser.GameObjects.Text;
  private matchSub!: Phaser.GameObjects.Text;
  private wiggle?: Phaser.Tweens.Tween;
  private wardrobe!: PlateButton;
  private forfeit!: Button;

  constructor() {
    super('ranked');
  }

  create(): void {
    this.waitingSince = 0;
    this.asked = false;
    this.error = '';
    this.backdrop();
    this.panel();
    this.chrome();

    net.on('any', this.handler);
    net.on('status', this.statusHandler);
    this.stopAccount = account.onChange(() => this.render());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      net.off('any', this.handler);
      net.off('status', this.statusHandler);
      this.stopAccount?.();
      if (this.waitingSince) net.send({ t: 'unqueue' });
      this.wiggle = undefined;
    });
    net.connect();
    void account.ensure().then(() => this.render());
    this.render();
  }

  update(): void {
    if (this.waitingSince) {
      const s = Math.floor((Date.now() - this.waitingSince) / 1000);
      const t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}  ·  แตะเพื่อยกเลิก`;
      // only when the second ticks: re-rendering a text every frame is wasted work
      if (this.matchSub.text !== t) fit(this.matchSub.setText(t).setScale(1), this.match.w * MATCH_TEXT.w, this.match.h * 0.2);
    }
  }

  /** The arena, the two painted fighters on their crates, and a glow behind the trophy. */
  private backdrop(): void {
    const bg = this.add.image(960, 540, R('bg'));
    bg.setScale(Math.max(1920 / bg.width, 1080 / bg.height));
    const glow = filled(this, R('trophy-glow'), box([625, 85, 421, 218]));
    this.tweens.add({ targets: glow, alpha: 0.6, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** The big panel: trophy on top, the player and rating, the rules strip and the match button. */
  private panel(): void {
    filled(this, R('panel'), box([274, 193, 1125, 642]));
    filled(this, R('trophy-mount'), box([647, 175, 375, 114]));
    const trophy = placed(this, R('trophy'), box([692, 122, 284, 165]));
    trophy.setOrigin(0.5, 1).setY(trophy.y + trophy.displayHeight / 2);
    this.tweens.add({ targets: trophy, scaleX: trophy.scaleX * 1.04, scaleY: trophy.scaleY * 1.04, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // the player, in the outfit they will fight in, on a glowing ring
    filled(this, R('avatar-ring'), box([443, 354, 211, 118]));
    const [ax, ay, aw, ah] = box([458, 236, 185, 220]);
    const me = this.add.image(ax + aw / 2, ay + ah, lookTexture(this, loadSetup(this.registry).loadout)).setOrigin(0.5, 1);
    me.setScale(Math.min(aw / me.width, ah / me.height));
    this.tweens.add({ targets: me, scaleY: me.scaleY * 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const [nx, ny, nw, nh] = box([680, 300, 324, 68]);
    this.name = this.add.text(nx + nw / 2, ny + nh / 2, '', {
      fontFamily: FONT, fontSize: '60px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 8,
    }).setOrigin(0.5);

    this.ratingPlate = filled(this, R('rating'), box([653, 368, 365, 89]));
    this.ratingTrophy = placed(this, R('trophy'), box([686, 383, 62, 56]));
    this.ratingLabel = this.add.text(0, this.ratingPlate.y, 'คะแนน', {
      fontFamily: FONT, fontSize: '38px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 5,
    }).setOrigin(0, 0.5);
    this.score = this.add.text(0, this.ratingPlate.y, '', {
      fontFamily: FONT, fontSize: '50px', fontStyle: 'bold', color: '#ffdf00', stroke: STROKE, strokeThickness: 6,
    }).setOrigin(0, 0.5);

    this.wardrobe = new PlateButton(this, R('btn-wardrobe'), box([1054, 350, 236, 86]), () => {
      this.registry.set('setupMode', 'ranked');
      this.scene.start('setup');
    });
    this.wardrobe.put(fitted(this, R('ico-wardrobe'), this.wardrobe.w * 0.22, this.wardrobe.h * 0.52), 0.26, 0.5);
    const wt = this.add.text(0, 0, 'แต่งตัว', { fontFamily: FONT, fontSize: '38px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 6 }).setOrigin(0, 0.5);
    this.wardrobe.put(fit(wt, this.wardrobe.w * 0.5, this.wardrobe.h * 0.6), 0.41, 0.48);
    // in place of the wardrobe while a ranked match is still running
    const [wx, wy, ww, wh] = box([1054, 350, 236, 86]);
    this.forfeit = new Button(this, wx + ww / 2, wy + wh / 2, ww, wh, 'ออก (นับว่าแพ้)', {
      fill: 0xc0392b, size: 28, onClick: () => {
        net.leave();
        this.scene.start('menu');
      },
    });

    const rules = filled(this, R('rules'), box([404, 480, 865, 73]));
    placed(this, R('info'), box([444, 494, 43, 43]));
    const [rx, , rw] = box([496, 496, 742, 39]);
    this.rulesW = rw;
    this.rules = this.add.text(rx + rw / 2, rules.y, '', { fontFamily: FONT, fontSize: '27px', color: '#ffffff' }).setOrigin(0.5);

    const rays = filled(this, R('rays'), box([467, 571, 739, 112]));
    this.tweens.add({ targets: rays, alpha: 0.55, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.match = new PlateButton(this, R('btn-match'), box([505, 592, 662, 190]), () => this.onMatch());
    this.matchIcon = fitted(this, R('ico-match'), this.match.w * 0.2, this.match.h * 0.62);
    this.match.put(this.matchIcon, 0.255, 0.5);
    this.matchTitle = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '76px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 10 }).setOrigin(0.5);
    this.matchSub = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 5 }).setOrigin(0.5);
    // text lives right of the swords (which end at 0.355) and short of the right bevel
    this.match.put(this.matchTitle, MATCH_TEXT.x, 0.48);
    this.match.put(this.matchSub, MATCH_TEXT.x, 0.72);

    // the fighters stand in front of the panel's sides, crates in front of their feet
    const fighter = (key: string, b: Box, delay: number) => {
      const [x, y, w, h] = box(b);
      const img = this.add.image(x + w / 2, y + h, R(key)).setOrigin(0.5, 1);
      img.setScale(Math.min(w / img.width, h / img.height));
      this.tweens.add({ targets: img, scaleY: img.scaleY * 1.025, duration: 850, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay });
    };
    fighter('hero', [0, 409, 351, 430], 0);
    fighter('scout', [1332, 457, 339, 384], 300);
    filled(this, R('crate-left'), box([172, 811, 357, 135]));
    filled(this, R('crate-right'), box([1301, 769, 370, 180]));
  }

  /** Back and menu buttons, the title plate, and the wallet. */
  private chrome(): void {
    const toMenu = () => this.scene.start('menu');
    const back = new PlateButton(this, R('btn-back'), box([19, 19, 96, 80]), toMenu);
    back.put(fitted(this, R('ico-back'), back.w * 0.5, back.h * 0.5), 0.5, 0.5);
    const menu = new PlateButton(this, R('btn-menu'), box([19, 827, 225, 94]), toMenu);
    menu.put(fitted(this, R('ico-menu'), menu.w * 0.24, menu.h * 0.45), 0.31, 0.5);
    const mt = this.add.text(0, 0, 'เมนู', { fontFamily: FONT, fontSize: '42px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 6 }).setOrigin(0, 0.5);
    menu.put(fit(mt, menu.w * 0.42, menu.h * 0.6), 0.47, 0.47);

    filled(this, R('header'), box([138, 21, 678, 90]));
    placed(this, R('logo'), box([138, 18, 178, 96]));
    const [dx, dy, , dh] = box([329, 41, 4, 49]);
    this.add.rectangle(dx, dy, 4, dh, 0xffffff, 0.75).setOrigin(0);
    placed(this, R('trophy'), box([350, 30, 86, 65]));
    const [tx, ty, tw, th] = box([446, 27, 300, 68]); // ends short of the plate's chevron
    const title = this.add.text(tx, ty + th / 2, 'แข่งขันอันดับ', {
      fontFamily: FONT, fontSize: '64px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 8,
    }).setOrigin(0, 0.5);
    fit(title, tw, th);

    walletBar(this);
  }

  private onNet(msg: ServerMsg): void {
    if (msg.t === 'match') {
      this.waitingSince = 0;
      this.scene.start('battle', { online: true });
    } else if (msg.t === 'queue') {
      this.waitingSince = msg.waiting ? Date.now() : 0;
      this.render();
    } else if (msg.t === 'error') {
      this.waitingSince = 0;
      this.asked = false;
      this.error = msg.msg;
      this.render();
    } else if (msg.t === 'account' || msg.t === 'room' || msg.t === 'left') this.render();
  }

  /** The big button: find a match, cancel the wait, or go back into a running ranked match. */
  private onMatch(): void {
    const room = net.room;
    if (room?.ranked && room.playing) {
      net.send({ t: 'resume' });
      return;
    }
    if (this.waitingSince) {
      net.send({ t: 'unqueue' });
      this.waitingSince = 0;
      this.asked = false;
      this.render();
      return;
    }
    const me = account.view;
    if (!net.authed || !me || this.asked) return;
    this.asked = true;
    this.error = '';
    const s = loadSetup(this.registry);
    net.send({ t: 'queue', name: me.displayName, loadout: s.loadout, items: s.items });
    this.render();
  }

  private render(): void {
    if (!this.sys.isActive()) return;
    const me = account.view;
    const room = net.room;
    const resuming = !!(room?.ranked && room.playing);
    const ready = net.connected && !!me;

    this.name.setText(me ? me.displayName : net.connected ? 'กำลังโหลดบัญชี…' : 'กำลังต่อเซิร์ฟเวอร์…');
    fit(this.name.setScale(1), 340, 78);
    this.score.setText(me ? String(me.rating) : '–');
    this.layoutRating();

    let rules = RULES;
    let color = '#ffffff';
    if (resuming) rules = 'แมตช์จัดอันดับยังเล่นอยู่ กลับไปเล่นต่อ หรือออก (นับว่าแพ้)';
    else if (this.waitingSince) rules = 'รอนานขึ้น = ยอมจับคู่กับคะแนนที่ห่างขึ้น';
    if (this.error) {
      rules = this.error;
      color = '#ffb3a6';
    }
    this.rules.setText(rules).setColor(color);
    fit(this.rules.setScale(1), this.rulesW, 44);

    this.wardrobe.setVisible(!resuming);
    this.forfeit.setVisible(resuming);

    let title = 'หาคู่แข่ง';
    let sub = '';
    if (resuming) title = 'กลับไปเล่นต่อ';
    else if (this.waitingSince) title = 'กำลังหาคู่…';
    else if (this.asked) title = 'กำลังเข้าคิว…';
    else if (!ready) sub = 'ต้องต่อเซิร์ฟเวอร์ก่อน';
    this.matchTitle.setText(title);
    fit(this.matchTitle.setScale(1), this.match.w * MATCH_TEXT.w, this.match.h * (sub || this.waitingSince ? 0.46 : 0.62));
    this.matchTitle.setY(-this.match.h / 2 + this.match.h * (sub || this.waitingSince ? 0.4 : 0.48));
    if (!this.waitingSince) fit(this.matchSub.setText(sub).setScale(1), this.match.w * MATCH_TEXT.w, this.match.h * 0.2);
    this.match.setEnabled(resuming || (ready && !this.asked) || !!this.waitingSince);

    const searching = !!this.waitingSince;
    // the swords pulse while searching (a pulse, not a rock: a rotated image inside a
    // container renders clipped in this Phaser build)
    if (searching && !this.wiggle) {
      const s = this.matchIcon.scale;
      this.wiggle = this.tweens.add({ targets: this.matchIcon, scale: s * 1.12, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.wiggle.on('stop', () => this.matchIcon.setScale(s));
    } else if (!searching && this.wiggle) {
      this.wiggle.stop();
      this.wiggle = undefined;
    }
  }

  /** "คะแนน 1000" centred in the space right of the small trophy on the rating plate. */
  private layoutRating(): void {
    const plate = this.ratingPlate;
    const left = this.ratingTrophy.x + this.ratingTrophy.displayWidth / 2 + 14;
    const right = plate.x + plate.displayWidth / 2 - 30;
    const gap = 14;
    const w = this.ratingLabel.width + gap + this.score.width;
    const s = Math.min(1, (right - left) / w);
    this.ratingLabel.setScale(s);
    this.score.setScale(s);
    const x0 = (left + right) / 2 - (w * s) / 2;
    this.ratingLabel.setX(x0);
    this.score.setX(x0 + (this.ratingLabel.width + gap) * s);
  }
}
