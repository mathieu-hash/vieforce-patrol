/**
 * Ensures locales/en.json, tl.json, and ceb.json have identical key sets.
 * Usage: node scripts/check-locale-parity.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'locales');

function loadKeys(file) {
  const raw = fs.readFileSync(path.join(root, file), 'utf8');
  const obj = JSON.parse(raw);
  return Object.keys(obj).sort();
}

const en = loadKeys('en.json');
const tl = loadKeys('tl.json');
const ceb = loadKeys('ceb.json');

function diff(a, nameA, b, nameB) {
  const setB = new Set(b);
  const missing = a.filter((k) => !setB.has(k));
  if (missing.length) {
    console.error('Keys in', nameA, 'missing from', nameB + ':', missing.join(', '));
    process.exitCode = 1;
  }
}

diff(en, 'en', tl, 'tl');
diff(tl, 'tl', en, 'en');
diff(en, 'en', ceb, 'ceb');
diff(ceb, 'ceb', en, 'en');

if (!process.exitCode) {
  console.log('OK: locale key parity (' + en.length + ' keys each).');
}
