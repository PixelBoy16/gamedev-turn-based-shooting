// Thai labels and hints for every field the admin page edits, keyed by config path.

export interface FieldLabel {
  label: string;
  hint?: string;
  unit?: string;
}

export const RULE_GROUPS: { title: string; fields: string[] }[] = [
  { title: 'ฟิสิกส์และลม', fields: ['rules.gravity', 'rules.windAccel', 'rules.maxWind', 'rules.launchSpeedPerPower'] },
  { title: 'การเดิน', fields: ['rules.walkSpeed', 'rules.fuelPerTurn'] },
  { title: 'การตก', fields: ['rules.safeFall', 'rules.fallDamagePerPx'] },
  { title: 'เทิร์นและพลังชีวิต', fields: ['rules.maxHp', 'rules.turnSeconds', 'rules.chargeSeconds'] },
  { title: 'กำแพงดิน (สกิลค้อนหิน)', fields: ['rules.wall.height', 'rules.wall.width', 'rules.wall.gap'] },
  { title: 'ช่วงท้ายเกม', fields: ['rules.suddenDeathTurn', 'rules.waterRisePerTurn'] },
  { title: 'ดีเลย์ (ลำดับเทิร์น)', fields: ['delay.shot', 'delay.pass', 'delay.skill', 'delay.perSecond', 'delay.perPx'] },
  {
    title: 'ดีเลย์เพิ่มตามอาวุธ',
    fields: ['cannon', 'hammer', 'splitter', 'shovel', 'drill', 'bouncer', 'beam', 'mortar', 'magnet', 'dirtbomb'].map((w) => `delay.weapons.${w}`),
  },
  { title: 'ดีเลย์เพิ่มตามไอเท็ม', fields: ['delay.items.double', 'delay.items.power', 'delay.items.warp', 'delay.items.heal', 'delay.items.armor'] },
  { title: 'จำกัดต่อแมตช์', fields: ['limits.drillUses', 'limits.skillCooldown', 'limits.stormSplit', 'limits.itemsPerMatch'] },
];

export const FIELDS: Record<string, FieldLabel> = {
  'rules.gravity': { label: 'แรงโน้มถ่วง', unit: 'px/s²', hint: 'มากขึ้น = กระสุนตกเร็ว วิถีโค้งแคบ' },
  'rules.windAccel': { label: 'แรงลมต่อระดับ', unit: 'px/s²', hint: 'ลม 1 ระดับผลักกระสุนแรงแค่ไหน' },
  'rules.maxWind': { label: 'ลมแรงสุด', unit: 'ระดับ' },
  'rules.launchSpeedPerPower': { label: 'ความเร็วต่อแรงยิง 1%', unit: 'px/s', hint: 'แรง 100% = ค่านี้ × 100' },
  'rules.walkSpeed': { label: 'ความเร็วเดิน', unit: 'px/s' },
  'rules.fuelPerTurn': { label: 'ระยะเดินต่อเทิร์น', unit: 'px', hint: 'ก่อนคูณค่าเดินจากอุปกรณ์' },
  'rules.safeFall': { label: 'ตกได้ไม่เจ็บ', unit: 'px' },
  'rules.fallDamagePerPx': { label: 'ดาเมจตกต่อ 1 px', hint: 'นับเฉพาะส่วนที่เกินระยะตกไม่เจ็บ' },
  'rules.maxHp': { label: 'HP เริ่มต้น', hint: 'ก่อนบวกจากอุปกรณ์' },
  'rules.turnSeconds': { label: 'เวลาต่อเทิร์น', unit: 'วินาที' },
  'rules.chargeSeconds': { label: 'เวลาชาร์จจนเต็ม', unit: 'วินาที' },
  'rules.wall.height': { label: 'ความสูงกำแพง', unit: 'px' },
  'rules.wall.width': { label: 'ความหนากำแพง', unit: 'px' },
  'rules.wall.gap': { label: 'ระยะห่างจากตัว', unit: 'px' },
  'rules.suddenDeathTurn': { label: 'น้ำเริ่มท่วมที่เทิร์น' },
  'rules.waterRisePerTurn': { label: 'น้ำขึ้นต่อเทิร์น', unit: 'px' },
  'delay.shot': { label: 'ยิง', hint: 'ทุกคนเริ่มที่ 0 คนที่ดีเลย์น้อยสุดได้เล่นก่อน แต่ละเทิร์นบวกค่าที่ทำไป' },
  'delay.pass': { label: 'ไม่ได้ยิง', hint: 'หมดเวลา หรือมุดดิน' },
  'delay.skill': { label: 'ใช้สกิล' },
  'delay.perSecond': { label: 'ต่อวินาทีที่ใช้', hint: 'เล็งช้า = ได้ตาถัดไปช้า' },
  'delay.perPx': { label: 'ต่อ 1 px ที่เดิน' },
  'delay.weapons.cannon': { label: 'ปืนใหญ่' },
  'delay.weapons.hammer': { label: 'ค้อนหิน' },
  'delay.weapons.splitter': { label: 'จรวดแตก' },
  'delay.weapons.bouncer': { label: 'ลูกเด้ง' },
  'delay.weapons.beam': { label: 'ปืนลำแสง' },
  'delay.weapons.mortar': { label: 'ครกลูกปราย' },
  'delay.weapons.magnet': { label: 'ระเบิดแม่เหล็ก' },
  'delay.weapons.dirtbomb': { label: 'ระเบิดดิน' },
  'delay.weapons.shovel': { label: 'พลั่วระเบิด' },
  'delay.weapons.drill': { label: 'สว่านเจาะ' },
  'delay.items.double': { label: 'ยิงคู่' },
  'delay.items.power': { label: 'พลัง' },
  'delay.items.warp': { label: 'วาร์ป' },
  'delay.items.heal': { label: 'ฟื้น HP' },
  'delay.items.armor': { label: 'เกราะ' },
  'limits.drillUses': { label: 'ใช้สว่านได้', unit: 'ครั้ง/แมตช์' },
  'limits.skillCooldown': { label: 'สกิลต้องรอ', unit: 'เทิร์นของตัวเอง' },
  'limits.stormSplit': { label: 'ห่าฝนแตกเป็น', unit: 'ลูก' },
  'limits.itemsPerMatch': { label: 'เลือกไอเท็มได้', unit: 'ชิ้น' },
  'itemValues.doubleScale': { label: 'ยิงคู่: ดาเมจต่อนัด', hint: '0.6 = 60%' },
  'itemValues.powerScale': { label: 'พลัง: คูณดาเมจ', hint: '1.3 = แรงขึ้น 30%' },
  'itemValues.heal': { label: 'ฟื้น HP', unit: 'HP' },
  'itemValues.armorScale': { label: 'เกราะ: ดาเมจที่ยังโดน', hint: '0.5 = โดนครึ่งเดียว' },
  'economy.startCoins': { label: 'เหรียญตอนสร้างบัญชี' },
  'economy.startGems': { label: 'เพชรตอนสร้างบัญชี' },
  'economy.winCoins': { label: 'ชนะได้เหรียญ' },
  'economy.lossCoins': { label: 'แพ้ได้เหรียญ' },
  'economy.winXp': { label: 'ชนะได้ XP' },
  'economy.lossXp': { label: 'แพ้ได้ XP' },
  'economy.minTurns': { label: 'เกมต้องยาวอย่างน้อย', unit: 'เทิร์น', hint: 'สั้นกว่านี้ (เช่นออกทันที) ไม่ได้รางวัล' },
  'season.xpPerTier': { label: 'XP ต่อขั้น' },
  'season.premiumGems': { label: 'ราคาพรีเมียม', unit: 'เพชร' },
};

export const WEAPON_FIELDS: { key: string; label: string; unit?: string; hint?: string }[] = [
  { key: 'damage', label: 'ดาเมจ', hint: 'เต็มที่เมื่อโดนกลางระเบิด' },
  { key: 'radius', label: 'รัศมีระเบิด', unit: 'px' },
  { key: 'knockback', label: 'แรงกระเด็น' },
  { key: 'windMul', label: 'ผลของลม', hint: '0 = ไม่โดนลม, 1 = ปกติ' },
  { key: 'gravityMul', label: 'น้ำหนัก', hint: '1 = ปกติ มากขึ้น = ตกเร็ว' },
  { key: 'speedMul', label: 'ความเร็วยิง', hint: 'เว้นว่าง = 1 (ปกติ)' },
];

export const WEAPON_EXTRA: Record<string, { key: string; label: string; unit?: string }[]> = {
  splitter: [{ key: 'split.count', label: 'แตกเป็น', unit: 'ลูก' }, { key: 'split.spreadVx', label: 'แตกกว้าง' }],
  drill: [{ key: 'drill.length', label: 'เจาะลึก', unit: 'px' }, { key: 'drill.carveRadius', label: 'ขนาดรู', unit: 'px' }],
  bouncer: [
    { key: 'bounce.count', label: 'เด้ง', unit: 'ครั้ง' }, { key: 'bounce.keep', label: 'แรงที่เหลือหลังเด้ง', unit: '×' },
    { key: 'bounce.boost', label: 'สกิลเด้งเพิ่ม', unit: 'ครั้ง' },
  ],
  beam: [{ key: 'pierce', label: 'สกิลทะลวงดิน', unit: 'px' }],
  mortar: [
    { key: 'cluster.count', label: 'ลูกปราย', unit: 'ลูก' }, { key: 'cluster.boostCount', label: 'ลูกปรายตอนใช้สกิล', unit: 'ลูก' },
    { key: 'cluster.damage', label: 'ดาเมจลูกปราย' }, { key: 'cluster.radius', label: 'รัศมีลูกปราย', unit: 'px' },
    { key: 'cluster.knockback', label: 'แรงกระเด็นลูกปราย' }, { key: 'cluster.spreadVx', label: 'ปรายกว้าง' },
    { key: 'cluster.lift', label: 'ปรายสูง' },
  ],
  magnet: [
    { key: 'pull.force', label: 'แรงดูด' }, { key: 'pull.radius', label: 'ระยะดูด', unit: 'px' },
    { key: 'pull.boostRadius', label: 'ระยะดูดตอนใช้สกิล', unit: 'px' },
  ],
  dirtbomb: [{ key: 'mound.radius', label: 'ขนาดเนินดิน', unit: 'px' }, { key: 'mound.boostRadius', label: 'ขนาดเนินตอนใช้สกิล', unit: 'px' }],
};

export const STAT_LABEL: Record<string, string> = { hp: 'HP', atk: 'โจมตี %', def: 'ป้องกัน %', move: 'เดิน %' };

export const EQUIP_SLOT_LABEL: Record<string, string> = { necklace: 'สร้อยคอ', ring: 'แหวน', bracelet: 'กำไล', charm: 'เครื่องราง' };

export const FASHION_SLOT_LABEL: Record<string, string> = {
  hat: 'หมวก', glasses: 'แว่น', hair: 'ทรงผม', face: 'ใบหน้า', cloth: 'ชุด', eyes: 'ตา', set: 'ชุดเซ็ต', back: 'ติดหลัง',
};

export const SKILL_LABEL: Record<string, string> = {
  calm: 'ไร้ลม', wall: 'กำแพงดิน', storm: 'ห่าฝน', burrow: 'มุดดิน',
  rebound: 'เด้งเพิ่ม', pierce: 'ทะลวง', barrage: 'ปรายหนัก', vortex: 'สนามดูด', landslide: 'ดินถล่ม',
};
