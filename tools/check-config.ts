import { readFileSync } from 'node:fs';
import { validateConfig } from '../src/core/config';

// `npm run check-config [file]`: check config/game.json (or another file) before
// restarting the server. Exits non-zero on errors; warnings are printed but allowed.

const file = process.argv[2] ?? 'config/game.json';
let raw: unknown;
try {
  raw = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`อ่าน ${file} ไม่ได้: ${(err as Error).message}`);
  process.exit(1);
}
const { errors, warnings } = validateConfig(raw);
for (const w of warnings) console.log(`เตือน  ${w}`);
for (const e of errors) console.log(`ผิด    ${e}`);
console.log(errors.length ? `\n${file}: ผิด ${errors.length} จุด ใช้ไม่ได้` : `\n${file}: ใช้ได้${warnings.length ? ` (เตือน ${warnings.length})` : ''}`);
process.exit(errors.length ? 1 : 0);
