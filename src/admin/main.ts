import { GameConfig, SKILL_IDS, WEAPON_IDS, validateConfig } from '../core/config';
import { serverHttpUrl } from '../net/serverUrl';
import {
  EQUIP_SLOT_LABEL, FASHION_SLOT_LABEL, FIELDS, RULE_GROUPS, SKILL_LABEL, STAT_LABEL, WEAPON_EXTRA, WEAPON_FIELDS,
} from './labels';

// The game masters' page (admin.html): edit the server's game config, check it as
// you type, see what changed, publish it as a new version, or start from an old one.
// Talks to the room server's /admin/api (server/admin.ts). A publish is used by new
// matches; matches in progress finish on the numbers they started with.

interface Meta {
  version: number;
  at: string;
  by: string;
  note: string;
}

type Path = (string | number)[];

const API = `${serverHttpUrl()}/admin/api`;
const TOKEN_KEY = 'crater-clash:admin';
const TABS = [
  ['rules', 'กติกา'], ['weapons', 'อาวุธ'], ['items', 'สกิลและไอเท็ม'], ['equipment', 'อุปกรณ์'], ['fashion', 'แฟชั่น'],
  ['pass', 'รางวัลและ Battle Pass'], ['players', 'ผู้เล่น'], ['history', 'ประวัติ'],
] as const;
type Tab = (typeof TABS)[number][0];
const STATS = ['hp', 'atk', 'def', 'move'] as const;
const OPTIONAL_SLOTS = ['hat', 'glasses', 'face', 'set', 'back'];
const DEFAULT_PIECES = ['hair/short', 'cloth/tee', 'eyes/round'];

let token = load(TOKEN_KEY);
let me = load(`${TOKEN_KEY}:name`);
let live: Meta & { config: GameConfig };
let draft: GameConfig;
let tab: Tab = 'rules';

// ------------------------------------------------------------------ helpers

function load(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function save(key: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // ignore: the sign-in only lasts this page then
  }
}

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k in el && k !== 'list') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const $ = (id: string) => document.getElementById(id)!;

function get(obj: unknown, path: Path): unknown {
  return path.reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k as string]), obj);
}

function set(obj: unknown, path: Path, value: unknown): void {
  let o = obj as Record<string, unknown>;
  for (const k of path.slice(0, -1)) o = (o[k as string] ??= {}) as Record<string, unknown>;
  const last = path[path.length - 1] as string;
  if (value === undefined) delete o[last];
  else o[last] = value;
}

const when = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (!res) throw new ApiError(0, 'ติดต่อเซิร์ฟเวอร์ไม่ได้');
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') {
    signOut('หมดเวลา กรุณาเข้าสู่ระบบใหม่');
    throw new ApiError(401, data.error);
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? `ผิดพลาด (${res.status})`, data);
  return data as T;
}

class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly data: Record<string, unknown> = {}) {
    super(message);
  }
}

function toast(msg: string, kind: 'ok' | 'bad' = 'ok'): void {
  const t = h('div', { class: `toast ${kind}` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3500);
}

// ------------------------------------------------------------------ sign in

function signOut(msg = ''): void {
  token = '';
  save(TOKEN_KEY, '');
  $('app').hidden = true;
  $('login').hidden = false;
  $('login-error').textContent = msg;
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = ($('login-name') as HTMLInputElement).value.trim();
  const password = ($('login-pass') as HTMLInputElement).value;
  $('login-error').textContent = '';
  try {
    const res = await api<{ token: string; name: string }>('/login', { name, password });
    token = res.token;
    me = res.name;
    save(TOKEN_KEY, token);
    save(`${TOKEN_KEY}:name`, me);
    ($('login-pass') as HTMLInputElement).value = '';
    await start();
  } catch (err) {
    $('login-error').textContent = (err as Error).message;
  }
});

async function start(): Promise<void> {
  live = await api('/config');
  draft = structuredClone(live.config);
  $('login').hidden = true;
  $('app').hidden = false;
  $('me').textContent = me;
  renderAll();
}

$('logout').addEventListener('click', () => {
  if (dirty() && !confirmDiscard()) return;
  signOut();
});

const confirmDiscard = () => window.confirm('ทิ้งค่าที่แก้ไว้ยังไม่ได้เผยแพร่?');

// ------------------------------------------------------------------ fields

/** A labelled number input bound to `path` in the draft. Blank = remove the key when `optional`. */
function numField(path: Path, label: string, opts: { unit?: string; hint?: string; optional?: boolean; disabled?: boolean } = {}): HTMLElement {
  const input = h('input', { type: 'number', step: 'any', inputMode: 'decimal', disabled: opts.disabled });
  const v = get(draft, path);
  input.value = typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
  input.addEventListener('input', () => {
    const raw = input.value.trim();
    set(draft, path, raw === '' ? (opts.optional ? undefined : NaN) : Number(raw));
    mark(input, path);
    changed();
  });
  mark(input, path);
  return h('label', { class: 'field' },
    h('span', { class: 'name' }, label, opts.unit ? h('small', {}, ` ${opts.unit}`) : null),
    input,
    opts.hint ? h('small', { class: 'hint' }, opts.hint) : null);
}

function textField(path: Path, label: string, opts: { long?: boolean; disabled?: boolean } = {}): HTMLElement {
  const input = opts.long ? h('textarea', { rows: 2, disabled: opts.disabled }) : h('input', { type: 'text', disabled: opts.disabled });
  input.value = String(get(draft, path) ?? '');
  input.addEventListener('input', () => {
    set(draft, path, input.value);
    mark(input, path);
    changed();
  });
  mark(input, path);
  return h('label', { class: `field${opts.long ? ' wide' : ''}` }, h('span', { class: 'name' }, label), input);
}

/** Flag an input whose value differs from the published config. Array rows compare by slot/id. */
function mark(input: HTMLElement, path: Path): void {
  const before = get(live.config, livePath(path));
  const now = get(draft, path);
  input.classList.toggle('changed', JSON.stringify(before) !== JSON.stringify(now));
}

function livePath(path: Path): Path {
  if ((path[0] === 'equipment' || path[0] === 'fashion') && typeof path[1] === 'number') {
    const row = draft[path[0]][path[1]] as { slot: string; id: string };
    const i = live.config[path[0]].findIndex((r) => r.slot === row.slot && r.id === row.id);
    return i < 0 ? ['__new__'] : [path[0], i, ...path.slice(2)];
  }
  return path;
}

// ------------------------------------------------------------------ tabs

function renderAll(): void {
  const nav = $('tabs');
  nav.replaceChildren(...TABS.map(([id, name]) => h('button', {
    class: id === tab ? 'on' : '', onclick: () => {
      tab = id;
      renderAll();
    },
  }, name)));
  $('live').textContent = `ใช้อยู่: v${live.version} โดย ${live.by} · ${when(live.at)}${live.note ? ` · ${live.note}` : ''}`;
  const main = $('main');
  main.replaceChildren();
  const body = {
    rules: renderRules, weapons: renderWeapons, items: renderItems, equipment: renderEquipment, fashion: renderFashion,
    pass: renderPass, players: renderPlayers, history: renderHistory,
  }[tab]();
  main.append(body);
  changed();
}

function section(title: string, ...kids: Child[]): HTMLElement {
  return h('section', { class: 'card' }, h('h2', {}, title), ...kids);
}

function renderRules(): HTMLElement {
  return h('div', {}, ...RULE_GROUPS.map((g) => section(g.title, h('div', { class: 'grid' }, ...g.fields.map((f) => {
    const l = FIELDS[f];
    return numField(f.split('.'), l.label, { unit: l.unit, hint: l.hint });
  })))));
}

function renderWeapons(): HTMLElement {
  return h('div', {}, ...WEAPON_IDS.map((id) => {
    const w = draft.weapons[id];
    const skill = id === 'drill' ? null : (() => {
      const sel = h('select', {}, ...SKILL_IDS.map((s) => h('option', { value: s, selected: w.skill === s }, SKILL_LABEL[s])));
      sel.addEventListener('change', () => {
        set(draft, ['weapons', id, 'skill'], sel.value);
        mark(sel, ['weapons', id, 'skill']);
        changed();
      });
      mark(sel, ['weapons', id, 'skill']);
      return h('label', { class: 'field' }, h('span', { class: 'name' }, 'สกิล (ปุ่ม E)'), sel);
    })();
    return section(`${w.name} · ${id}${id === 'drill' ? ' (อาวุธรองที่ทุกคนมี)' : ''}`,
      h('div', { class: 'grid' },
        textField(['weapons', id, 'name'], 'ชื่อ'),
        skill,
        textField(['weapons', id, 'desc'], 'คำอธิบาย', { long: true }),
        ...WEAPON_FIELDS.map((f) => numField(['weapons', id, f.key], f.label, { unit: f.unit, hint: f.hint, optional: f.key === 'speedMul' })),
        ...(WEAPON_EXTRA[id] ?? []).map((f) => numField(['weapons', id, ...f.key.split('.')], f.label, { unit: f.unit }))));
  }));
}

function renderItems(): HTMLElement {
  return h('div', {},
    section('สกิล', h('div', { class: 'grid' }, ...SKILL_IDS.flatMap((id) => [
      textField(['skills', id, 'name'], `ชื่อ (${id})`), textField(['skills', id, 'desc'], 'คำอธิบาย', { long: true }),
    ]))),
    section('ไอเท็ม', h('div', { class: 'grid' }, ...(Object.keys(draft.items) as (keyof GameConfig['items'])[]).flatMap((id) => [
      textField(['items', id, 'name'], `ชื่อ (${id})`), textField(['items', id, 'desc'], 'คำอธิบาย', { long: true }),
    ]))),
    section('ผลของไอเท็ม', h('div', { class: 'grid' }, ...Object.keys(draft.itemValues).map((k) => {
      const l = FIELDS[`itemValues.${k}`];
      return numField(['itemValues', k], l.label, { unit: l.unit, hint: l.hint });
    }))));
}

function newId(list: { slot: string; id: string }[], slot: string, base: string): string {
  for (let i = 1; ; i++) if (!list.some((r) => r.slot === slot && r.id === `${base}${i}`)) return `${base}${i}`;
}

/** Insert a row after the last row of its slot, so slots stay grouped in the file. */
function insertInSlot<T extends { slot: string }>(list: T[], row: T): void {
  let at = list.length;
  list.forEach((r, i) => {
    if (r.slot === row.slot) at = i + 1;
  });
  list.splice(at, 0, row);
}

function removeButton(onclick: () => void, disabled: boolean, why: string): HTMLElement {
  return h('button', { class: 'icon', title: disabled ? why : 'ลบ', disabled, onclick }, '✕');
}

function renderEquipment(): HTMLElement {
  const sp = draft.statPoint;
  const top = section('ค่าของ 1 แต้ม',
    h('p', { class: 'note' }, 'อุปกรณ์ทุกชิ้นควรได้เท่ากับที่เสีย เช่น HP +50 แลกกับโจมตี −5% เพื่อไม่ให้มีชิ้นที่ดีกว่าทุกชิ้น (ไม่ pay-to-win)'),
    h('div', { class: 'grid' }, ...STATS.map((k) => numField(['statPoint', k], STAT_LABEL[k]))));
  const slots = Object.keys(EQUIP_SLOT_LABEL).map((slot) => {
    const rows = draft.equipment.map((e, i) => ({ e, i })).filter((r) => r.e.slot === slot);
    return section(EQUIP_SLOT_LABEL[slot],
      h('div', { class: 'table' },
        h('div', { class: 'row head eq' }, h('span', {}, 'id'), h('span', {}, 'ชื่อ'), ...STATS.map((k) => h('span', {}, STAT_LABEL[k])), h('span', {}, 'สี'), h('span', {}, 'สมดุล'), h('span', {}, 'ราคา'), h('span', {})),
        ...rows.map(({ e, i }) => {
          const none = e.id === 'none';
          const balance = h('span', { class: 'balance' });
          const showBalance = () => {
            const pts = STATS.reduce((s, k) => s + (e.stats[k] ?? 0) / (sp[k] || 1), 0);
            const r = Math.round(pts * 100) / 100;
            balance.textContent = Math.abs(r) < 1e-6 ? '0 ✓' : `${r > 0 ? '+' : ''}${r}`;
            balance.classList.toggle('warn', Math.abs(r) >= 1e-6);
          };
          showBalance();
          const cell = (el: HTMLElement) => {
            el.addEventListener('input', showBalance);
            return el;
          };
          return h('div', { class: 'row eq' },
            textField(['equipment', i, 'id'], 'id', { disabled: none }),
            textField(['equipment', i, 'name'], 'ชื่อ'),
            ...STATS.map((k) => cell(numField(['equipment', i, 'stats', k], STAT_LABEL[k], { optional: true, disabled: none }))),
            none ? h('span', {}) : h('span', { class: 'colors' }, colorInput(i, 0), colorInput(i, 1)),
            balance,
            none ? h('span', {}) : saleField('equipment', i),
            removeButton(() => {
              draft.equipment.splice(i, 1);
              renderAll();
            }, none, 'ต้องมี "ไม่ใส่" ทุกช่อง'));
        })),
      h('button', {
        class: 'add', onclick: () => {
          insertInSlot(draft.equipment, { id: newId(draft.equipment, slot, 'new'), slot: slot as GameConfig['equipment'][number]['slot'], name: 'ชิ้นใหม่', stats: {}, color: ['#cccccc', '#888888'] });
          renderAll();
        },
      }, `+ เพิ่ม${EQUIP_SLOT_LABEL[slot]}`));
  });
  return h('div', {}, top, ...slots);
}

/** How a piece is sold: free, coins, gems (fashion only) or Battle Pass only (fashion only), plus the amount. */
function saleField(list: 'fashion' | 'equipment', i: number): HTMLElement {
  const row = draft[list][i] as { price?: { coins?: number; gems?: number }; exclusive?: boolean };
  const mode = row.exclusive ? 'pass' : row.price?.gems ? 'gems' : row.price?.coins ? 'coins' : 'free';
  const modes: [string, string][] = list === 'fashion'
    ? [['free', 'ฟรี'], ['coins', 'เหรียญ'], ['gems', 'เพชร'], ['pass', 'Battle Pass']]
    : [['free', 'ฟรี'], ['coins', 'เหรียญ']];
  const sel = h('select', {}, ...modes.map(([v, t]) => h('option', { value: v, selected: v === mode }, t)));
  const amount = h('input', { type: 'number', min: 1, step: 1, inputMode: 'numeric', value: String(row.price?.gems ?? row.price?.coins ?? ''), disabled: mode === 'free' || mode === 'pass' });
  const apply = () => {
    const n = amount.value.trim() === '' ? NaN : Number(amount.value);
    delete row.price;
    delete row.exclusive;
    if (sel.value === 'coins') row.price = { coins: n };
    else if (sel.value === 'gems') row.price = { gems: n };
    else if (sel.value === 'pass') row.exclusive = true;
    amount.disabled = sel.value === 'free' || sel.value === 'pass';
    const before = get(live.config, livePath([list, i]));
    const differs = (k: string) => JSON.stringify((before as Record<string, unknown> | undefined)?.[k]) !== JSON.stringify((row as Record<string, unknown>)[k]);
    wrap.classList.toggle('changed', differs('price') || differs('exclusive'));
    changed();
  };
  sel.addEventListener('change', () => {
    if ((sel.value === 'coins' || sel.value === 'gems') && !amount.value) amount.value = sel.value === 'gems' ? '30' : '300';
    apply();
  });
  amount.addEventListener('input', apply);
  const wrap = h('span', { class: 'sale' }, sel, amount);
  const before = get(live.config, livePath([list, i])) as Record<string, unknown> | undefined;
  wrap.classList.toggle('changed', JSON.stringify(before?.price) !== JSON.stringify(row.price) || before?.exclusive !== row.exclusive);
  return wrap;
}

function colorInput(i: number, which: 0 | 1): HTMLElement {
  const path: Path = ['equipment', i, 'color', which];
  const input = h('input', { type: 'color', value: String(get(draft, path)), title: which ? 'สีอัญมณี' : 'สีโลหะ' });
  input.addEventListener('input', () => {
    set(draft, path, input.value);
    mark(input, path);
    changed();
  });
  mark(input, path);
  return input;
}

function renderFashion(): HTMLElement {
  return h('div', {},
    h('p', { class: 'note' }, 'แฟชั่นเปลี่ยนแค่หน้าตา ไม่มีผลกับค่าสถานะ ชิ้นใหม่จะเห็นบนตัวละครเมื่อมีภาพในเกมแล้ว (src/art/look/<ช่อง>-<id>.png)'),
    ...Object.keys(FASHION_SLOT_LABEL).map((slot) => {
      const rows = draft.fashion.map((f, i) => ({ f, i })).filter((r) => r.f.slot === slot);
      return section(FASHION_SLOT_LABEL[slot],
        h('div', { class: 'table' },
          h('div', { class: 'row head fa' }, h('span', {}, 'id'), h('span', {}, 'ชื่อ'), h('span', {}, 'ราคา'), h('span', {})),
          ...rows.map(({ f, i }) => {
            const locked = f.id === 'none' || DEFAULT_PIECES.includes(`${slot}/${f.id}`);
            return h('div', { class: 'row fa' },
              textField(['fashion', i, 'id'], 'id', { disabled: locked }),
              textField(['fashion', i, 'name'], 'ชื่อ'),
              locked ? h('span', { class: 'muted' }, 'ฟรี (ชิ้นเริ่มต้น)') : saleField('fashion', i),
              removeButton(() => {
                draft.fashion.splice(i, 1);
                renderAll();
              }, locked, f.id === 'none' ? 'ช่องนี้ต้องมี "ไม่ใส่"' : 'ชุดเริ่มต้น ลบไม่ได้'));
          })),
        h('button', {
          class: 'add', onclick: () => {
            insertInSlot(draft.fashion, { id: newId(draft.fashion, slot, 'new'), slot: slot as GameConfig['fashion'][number]['slot'], name: 'ชิ้นใหม่' });
            renderAll();
          },
        }, `+ เพิ่ม${FASHION_SLOT_LABEL[slot]}`),
        OPTIONAL_SLOTS.includes(slot) ? null : h('small', { class: 'hint' }, 'ช่องนี้ต้องใส่เสมอ ไม่มี "ไม่ใส่"'));
    }));
}

/** Every piece a reward or a grant can name: "fashion:<slot>/<id>" / "equip:<slot>/<id>", without the empty choices. */
function itemKeys(): { key: string; name: string }[] {
  return [
    ...draft.fashion.filter((f) => f.id !== 'none').map((f) => ({ key: `fashion:${f.slot}/${f.id}`, name: `${FASHION_SLOT_LABEL[f.slot]}: ${f.name}` })),
    ...draft.equipment.filter((e) => e.id !== 'none').map((e) => ({ key: `equip:${e.slot}/${e.id}`, name: `${EQUIP_SLOT_LABEL[e.slot]}: ${e.name}` })),
  ];
}

/** One Battle Pass reward cell: nothing, coins, gems or a piece. */
function rewardField(tier: number, track: 'free' | 'premium'): HTMLElement {
  const path: Path = ['season', 'tiers', tier, track];
  const r = get(draft, path) as Record<string, unknown> | undefined;
  const kind = !r ? 'none' : 'coins' in r ? 'coins' : 'gems' in r ? 'gems' : 'item';
  const sel = h('select', {}, ...[['none', 'ไม่มี'], ['coins', 'เหรียญ'], ['gems', 'เพชร'], ['item', 'ไอเทม']].map(([v, t]) => h('option', { value: v, selected: v === kind }, t)));
  const amount = h('input', { type: 'number', min: 1, step: 1, inputMode: 'numeric', value: kind === 'coins' || kind === 'gems' ? String(r![kind]) : '' });
  const item = h('select', {}, ...itemKeys().map((k) => h('option', { value: k.key, selected: kind === 'item' && r!.item === k.key }, k.name)));
  const wrap = h('span', { class: 'sale' }, sel, amount, item);
  const apply = () => {
    amount.hidden = sel.value !== 'coins' && sel.value !== 'gems';
    item.hidden = sel.value !== 'item';
    const n = amount.value.trim() === '' ? NaN : Number(amount.value);
    set(draft, path, sel.value === 'none' ? undefined : sel.value === 'item' ? { item: item.value } : { [sel.value]: n });
    mark(wrap, path);
    changed();
  };
  sel.addEventListener('change', () => {
    if ((sel.value === 'coins' || sel.value === 'gems') && !amount.value) amount.value = sel.value === 'gems' ? '10' : '100';
    apply();
  });
  amount.addEventListener('input', apply);
  item.addEventListener('change', apply);
  amount.hidden = kind !== 'coins' && kind !== 'gems';
  item.hidden = kind !== 'item';
  mark(wrap, path);
  return wrap;
}

function renderPass(): HTMLElement {
  const s = draft.season;
  const ends = h('input', { type: 'datetime-local', value: toLocalInput(s.endsAt) });
  ends.addEventListener('input', () => {
    set(draft, ['season', 'endsAt'], ends.value ? new Date(ends.value).toISOString() : '');
    mark(ends, ['season', 'endsAt']);
    changed();
  });
  mark(ends, ['season', 'endsAt']);
  return h('div', {},
    section('รางวัลต่อเกม', h('p', { class: 'note' }, 'ได้เฉพาะเกมที่มีผู้เล่นจริง 2 บัญชีขึ้นไป (ห้องเพื่อนหรือจัดอันดับ) เล่นกับบอทอย่างเดียวไม่ได้'),
      h('div', { class: 'grid' }, ...Object.keys(draft.economy).map((k) => {
        const l = FIELDS[`economy.${k}`];
        return numField(['economy', k], l.label, { unit: l.unit, hint: l.hint });
      }))),
    section('ซีซัน',
      h('p', { class: 'note' }, 'เปลี่ยน id = เริ่มซีซันใหม่ ทุกคนกลับไปขั้น 0 (ของที่ได้ไปแล้วยังอยู่)'),
      h('div', { class: 'grid' },
        textField(['season', 'id'], 'id ซีซัน'),
        textField(['season', 'name'], 'ชื่อซีซัน'),
        h('label', { class: 'field' }, h('span', { class: 'name' }, 'จบซีซัน'), ends),
        numField(['season', 'xpPerTier'], FIELDS['season.xpPerTier'].label),
        numField(['season', 'premiumGems'], FIELDS['season.premiumGems'].label, { unit: FIELDS['season.premiumGems'].unit }))),
    section(`ขั้นของรางวัล (${s.tiers.length} ขั้น)`,
      h('div', { class: 'table' },
        h('div', { class: 'row head tier' }, h('span', {}, 'ขั้น'), h('span', {}, 'สายฟรี'), h('span', {}, 'สายพรีเมียม')),
        ...s.tiers.map((_, i) => h('div', { class: 'row tier' }, h('strong', {}, String(i + 1)), rewardField(i, 'free'), rewardField(i, 'premium')))),
      h('div', { class: 'bar-inline' },
        h('button', { class: 'add', onclick: () => { s.tiers.push({ free: { coins: 100 } }); renderAll(); } }, '+ เพิ่มขั้น'),
        h('button', { class: 'add', disabled: s.tiers.length <= 1, onclick: () => { s.tiers.pop(); renderAll(); } }, '− ลบขั้นสุดท้าย'))));
}

/** ISO time → the value a datetime-local input wants (the admin's local time). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface PlayerInfo {
  username: string;
  displayName: string;
  coins: number;
  gems: number;
  rating: number;
  played: number;
  owned: string[];
  pass: { xp: number; premium: boolean };
}

function renderPlayers(): HTMLElement {
  const user = h('input', { type: 'text', placeholder: 'ชื่อผู้ใช้', autocapitalize: 'off' });
  const out = h('div', {});
  const show = (p: PlayerInfo) => {
    const coins = h('input', { type: 'number', min: 0, step: 1, value: '0' });
    const gems = h('input', { type: 'number', min: 0, step: 1, value: '0' });
    const item = h('select', {}, h('option', { value: '' }, '— ไม่ให้ไอเทม —'), ...itemKeys().map((k) => h('option', { value: k.key }, k.name)));
    const reason = h('input', { type: 'text', placeholder: 'เหตุผล เช่น ชดเชยเซิร์ฟล่ม 3 พ.ย.', maxLength: 200 });
    out.replaceChildren(
      section(`${p.displayName} (@${p.username})`,
        h('p', {}, `🪙 ${p.coins.toLocaleString()} · 💎 ${p.gems.toLocaleString()} · คะแนน ${p.rating} · เล่น ${p.played} เกม · Battle Pass ${p.pass.xp} XP${p.pass.premium ? ' (พรีเมียม)' : ''} · มีของ ${p.owned.length} ชิ้น`)),
      section('ให้ของ (มีผลทันที ไม่ต้องกดเผยแพร่)',
        h('div', { class: 'grid' },
          h('label', { class: 'field' }, h('span', { class: 'name' }, 'เหรียญ'), coins),
          h('label', { class: 'field' }, h('span', { class: 'name' }, 'เพชร'), gems),
          h('label', { class: 'field' }, h('span', { class: 'name' }, 'ไอเทม'), item),
          h('label', { class: 'field wide' }, h('span', { class: 'name' }, 'เหตุผล (บันทึกไว้ในประวัติการเงิน)'), reason)),
        h('button', {
          class: 'primary', onclick: async () => {
            const body = { username: p.username, coins: Number(coins.value) || 0, gems: Number(gems.value) || 0, item: item.value || undefined, reason: reason.value };
            if (!window.confirm(`ให้ ${p.displayName}: ${body.coins} เหรียญ, ${body.gems} เพชร${body.item ? `, ${item.selectedOptions[0].text}` : ''}?`)) return;
            try {
              show(await api<PlayerInfo>('/grant', body));
              toast('ให้ของแล้ว');
            } catch (err) {
              toast((err as Error).message, 'bad');
            }
          },
        }, 'ให้')));
  };
  const find = async () => {
    try {
      show(await api<PlayerInfo>(`/player?username=${encodeURIComponent(user.value.trim())}`));
    } catch (err) {
      out.replaceChildren(h('p', { class: 'error' }, (err as Error).message));
    }
  };
  user.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void find();
  });
  return h('div', {},
    section('ค้นหาผู้เล่น', h('p', { class: 'note' }, 'ค้นได้เฉพาะบัญชีที่ตั้งชื่อผู้ใช้แล้ว'),
      h('div', { class: 'bar-inline' }, user, h('button', { onclick: find }, 'ค้นหา'))),
    out);
}

function renderHistory(): HTMLElement {
  const box = h('div', {}, h('p', { class: 'note' }, 'กำลังโหลด…'));
  api<Meta[]>('/history').then((list) => {
    box.replaceChildren(section('เวอร์ชันที่เผยแพร่', h('div', { class: 'table' }, ...list.map((v) => h('div', { class: 'row hist' },
      h('strong', {}, `v${v.version}`),
      h('span', {}, `${v.by} · ${when(v.at)}`),
      h('span', { class: 'muted' }, v.note || '—'),
      v.version === live.version ? h('span', { class: 'pill' }, 'ใช้อยู่') : h('button', {
        onclick: async () => {
          if (dirty() && !confirmDiscard()) return;
          const { config } = await api<{ config: GameConfig }>(`/history/${v.version}`);
          draft = config;
          ($('note') as HTMLInputElement).value = `ย้อนกลับเป็น v${v.version}`;
          tab = 'rules';
          renderAll();
          toast(`โหลด v${v.version} มาเป็นร่างแล้ว ตรวจแล้วกดเผยแพร่เพื่อใช้`);
        },
      }, 'ใช้เป็นร่าง'))))));
  }).catch((err) => box.replaceChildren(h('p', { class: 'error' }, (err as Error).message)));
  return box;
}

// ------------------------------------------------------------------ changes, checks, publish

const dirty = () => !!live && JSON.stringify(live.config) !== JSON.stringify(draft);

function labelOf(path: Path): string {
  const key = path.join('.');
  if (FIELDS[key]) return FIELDS[key].label;
  if (path[0] === 'season' && path[1] === 'tiers') return `Battle Pass ขั้น ${Number(path[2]) + 1} ${path[3] === 'premium' ? 'พรีเมียม' : 'ฟรี'}`;
  if (path[0] === 'weapons') {
    const w = live.config.weapons[path[1] as keyof GameConfig['weapons']];
    const f = WEAPON_FIELDS.find((x) => x.key === path[2]) ?? Object.values(WEAPON_EXTRA).flat().find((x) => x.key === path.slice(2).join('.'));
    return `${w?.name ?? path[1]}: ${f?.label ?? path.slice(2).join('.')}`;
  }
  return key;
}

const show = (v: unknown) => (v === undefined ? '(ว่าง)' : typeof v === 'string' ? `"${v}"` : JSON.stringify(v));

/** What the draft changes compared to the published config, one line each. */
function changes(): string[] {
  const out: string[] = [];
  const walk = (a: unknown, b: unknown, path: Path) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.max(a.length, b.length); i++) walk(a[i], b[i], [...path, i]);
      return;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], [...path, k]);
      }
      return;
    }
    out.push(`${labelOf(path)}: ${show(a)} → ${show(b)}`);
  };
  for (const k of Object.keys(draft) as (keyof GameConfig)[]) {
    if (k === 'equipment' || k === 'fashion') continue;
    walk(live.config[k], draft[k], [k]);
  }
  for (const k of ['equipment', 'fashion'] as const) {
    const kind = k === 'equipment' ? 'อุปกรณ์' : 'แฟชั่น';
    const key = (r: { slot: string; id: string }) => `${r.slot}/${r.id}`;
    const before = new Map<string, { slot: string; id: string; name: string }>(live.config[k].map((r) => [key(r), r]));
    const after = new Map<string, { slot: string; id: string; name: string }>(draft[k].map((r) => [key(r), r]));
    for (const [id, r] of after) {
      const old = before.get(id);
      if (!old) out.push(`เพิ่ม${kind} ${r.name} (${id})`);
      else if (JSON.stringify(old) !== JSON.stringify(r)) {
        const sub: string[] = [];
        for (const f of new Set([...Object.keys(old), ...Object.keys(r)])) {
          const a = (old as unknown as Record<string, unknown>)[f];
          const b = (r as unknown as Record<string, unknown>)[f];
          if (JSON.stringify(a) !== JSON.stringify(b)) sub.push(`${f} ${show(a)} → ${show(b)}`);
        }
        out.push(`${kind} ${old.name} (${id}): ${sub.join(', ')}`);
      }
    }
    for (const [id, r] of before) if (!after.has(id)) out.push(`ลบ${kind} ${r.name} (${id})`);
  }
  return out;
}

function changed(): void {
  if (!live) return;
  const list = changes();
  const report = validateConfig(draft);
  $('summary').textContent = list.length
    ? `แก้ ${list.length} จุด${report.errors.length ? ` · ผิด ${report.errors.length}` : ''}${report.warnings.length ? ` · เตือน ${report.warnings.length}` : ''}`
    : 'ยังไม่ได้แก้อะไร';
  $('summary').className = report.errors.length ? 'bad' : '';
  ($('publish') as HTMLButtonElement).disabled = !list.length || report.errors.length > 0;
  ($('discard') as HTMLButtonElement).disabled = !list.length;
  const parts: (HTMLElement | null)[] = [
    report.errors.length ? h('div', { class: 'errors' }, h('h3', {}, 'ต้องแก้ก่อนเผยแพร่'), h('ul', {}, ...report.errors.map((e) => h('li', {}, e)))) : null,
    report.warnings.length ? h('div', { class: 'warnings' }, h('h3', {}, 'คำเตือน (เผยแพร่ได้)'), h('ul', {}, ...report.warnings.map((e) => h('li', {}, e)))) : null,
    list.length ? h('div', {}, h('h3', {}, 'ที่แก้'), h('ul', {}, ...list.map((e) => h('li', {}, e)))) : null,
  ];
  $('details').replaceChildren(...parts.filter((p): p is HTMLElement => !!p));
  $('details-toggle').hidden = !list.length && !report.errors.length && !report.warnings.length;
}

$('details-toggle').addEventListener('click', () => {
  $('details').hidden = !$('details').hidden;
});

$('discard').addEventListener('click', () => {
  if (!confirmDiscard()) return;
  draft = structuredClone(live.config);
  renderAll();
});

$('publish').addEventListener('click', async () => {
  const note = ($('note') as HTMLInputElement).value.trim();
  if (!window.confirm(`เผยแพร่เป็น v${live.version + 1}? แมตช์ใหม่จะใช้ค่านี้ทันที แมตช์ที่เล่นอยู่ใช้ค่าเดิมจนจบ`)) return;
  try {
    const meta = await api<Meta>('/publish', { config: draft, note, base: live.version });
    live = { ...meta, config: structuredClone(draft) };
    ($('note') as HTMLInputElement).value = '';
    renderAll();
    toast(`เผยแพร่ v${meta.version} แล้ว`);
  } catch (err) {
    const e = err as ApiError;
    toast(e.message, 'bad');
    if (e.status === 409 && window.confirm('โหลดเวอร์ชันล่าสุดมาแทน? ค่าที่แก้ไว้จะหาย')) await start();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (dirty()) e.preventDefault();
});

if (token) start().catch(() => signOut());
else signOut();
