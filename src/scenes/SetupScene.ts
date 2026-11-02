import Phaser from 'phaser';
import { ART_SCALE, IconId, iconTexture, poseTexture } from '../art/chibi';
import { CHARACTERS, CHARACTER_IDS, ITEMS, ITEMS_PER_MATCH, ITEM_IDS, SKILLS, WEAPONS } from '../core/data';
import { MAPS, MAP_IDS } from '../core/Maps';
import { Difficulty } from '../core/BotAI';
import { Button, FONT, label } from '../ui/widgets';
import { menuBackdrop } from './backdrop';
import { DIFF_LABEL, FORMAT_LABEL, Format, MatchSetup, loadSetup, saveSetup } from './setup';

const FORMATS: Format[] = ['1v1', '1v2', '2v2'];
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

/** Pick character, 3 items, map, format and bot difficulty. */
export default class SetupScene extends Phaser.Scene {
  private setup!: MatchSetup;
  private refreshers: (() => void)[] = [];
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super('setup');
  }

  init(): void {
    this.setup = loadSetup(this.registry);
    this.refreshers = [];
  }

  create(): void {
    menuBackdrop(this);
    const shade = this.add.graphics();
    shade.fillStyle(0x10162a, 0.55);
    shade.fillRect(0, 0, 1920, 1080);
    label(this, 60, 30, 'เตรียมตัว', 56, '#ffd166');

    this.characterCards();
    this.itemPicker();
    this.rightColumn();

    this.hint = label(this, 960, 1040, '', 26, '#ffd166').setOrigin(0.5);
    new Button(this, 200, 990, 260, 90, '← กลับ', { size: 34, onClick: () => this.scene.start('menu') });
    new Button(this, 1640, 985, 440, 110, 'เริ่มเล่น!', { fill: 0x2f9e44, size: 48, onClick: () => this.start() });
    this.refresh();
  }

  private refresh(): void {
    for (const r of this.refreshers) r();
  }

  private start(): void {
    if (this.setup.items.length !== ITEMS_PER_MATCH) {
      this.say(`เลือกไอเท็มให้ครบ ${ITEMS_PER_MATCH} ชิ้นก่อนนะ`);
      return;
    }
    saveSetup(this.registry, this.setup);
    this.scene.start('battle');
  }

  private say(msg: string): void {
    this.hint.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.hint);
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 1800, duration: 400 });
  }

  private characterCards(): void {
    label(this, 60, 110, 'ตัวละคร', 34);
    CHARACTER_IDS.forEach((id, i) => {
      const def = CHARACTERS[id];
      const x = 230 + i * 340;
      const card = new Button(this, x, 390, 310, 480, '', {
        fill: 0x2b3350, radius: 22,
        onClick: () => { this.setup.char = id; this.refresh(); },
      });
      const img = this.add.image(x, 330, poseTexture(this, id, 'idle')).setOrigin(0.5, 1).setScale(ART_SCALE * 2.6);
      label(this, x, 345, def.name, 38, '#ffd166').setOrigin(0.5, 0);
      label(this, x, 395, def.style, 22).setOrigin(0.5, 0);
      this.add.text(x, 440, `อาวุธ: ${WEAPONS[def.weapon].name}\nสกิล: ${SKILLS[def.skill].name}\n${SKILLS[def.skill].desc}`, {
        fontFamily: FONT, fontSize: '21px', color: '#e6ecff', align: 'center', wordWrap: { width: 270 }, lineSpacing: 4,
      }).setOrigin(0.5, 0);
      this.refreshers.push(() => {
        const on = this.setup.char === id;
        card.setSelected(on);
        img.setAlpha(on ? 1 : 0.7);
      });
    });
  }

  private itemPicker(): void {
    const title = label(this, 60, 670, '', 34);
    ITEM_IDS.forEach((id, i) => {
      const x = 180 + i * 230;
      const btn = new Button(this, x, 760, 210, 80, ITEMS[id].name, {
        size: 28,
        onClick: () => {
          const s = this.setup.items;
          const at = s.indexOf(id);
          if (at >= 0) s.splice(at, 1);
          else if (s.length < ITEMS_PER_MATCH) s.push(id);
          else this.say(`เลือกได้ ${ITEMS_PER_MATCH} ชิ้น กดชิ้นที่เลือกแล้วเพื่อเอาออก`);
          this.refresh();
        },
      });
      btn.setIcon(iconTexture(this, id as IconId));
      this.add.text(x, 812, ITEMS[id].desc, {
        fontFamily: FONT, fontSize: '19px', color: '#cfd8ff', align: 'center', wordWrap: { width: 200 },
      }).setOrigin(0.5, 0);
      this.refreshers.push(() => btn.setSelected(this.setup.items.includes(id)));
    });
    this.refreshers.push(() => title.setText(`ไอเท็ม (เลือก ${ITEMS_PER_MATCH}) — เลือกแล้ว ${this.setup.items.length}`));
  }

  private rightColumn(): void {
    const cx = 1560;
    label(this, cx - 200, 110, 'ด่าน', 34);
    const mapDesc = label(this, cx, 410, '', 22, '#cfd8ff').setOrigin(0.5, 0);
    MAP_IDS.forEach((id, i) => {
      const btn = new Button(this, cx, 190 + i * 76, 400, 64, MAPS[id].name, {
        size: 30, onClick: () => { this.setup.map = id; this.refresh(); },
      });
      this.refreshers.push(() => btn.setSelected(this.setup.map === id));
    });
    this.refreshers.push(() => mapDesc.setText(MAPS[this.setup.map].desc));

    label(this, cx - 200, 460, 'รูปแบบ', 34);
    FORMATS.forEach((f, i) => {
      const btn = new Button(this, cx, 540 + i * 72, 400, 60, FORMAT_LABEL[f], {
        size: 28, onClick: () => { this.setup.format = f; this.refresh(); },
      });
      this.refreshers.push(() => btn.setSelected(this.setup.format === f));
    });

    label(this, cx - 200, 740, 'ความเก่งของบอท', 34);
    DIFFICULTIES.forEach((d, i) => {
      const btn = new Button(this, cx - 135 + i * 135, 830, 120, 64, DIFF_LABEL[d], {
        size: 28, onClick: () => { this.setup.difficulty = d; this.refresh(); },
      });
      this.refreshers.push(() => btn.setSelected(this.setup.difficulty === d));
    });
  }
}
