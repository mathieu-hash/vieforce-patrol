// Mirrors formatting rules in js/sales-tab.js (keep in sync on intentional changes).
const test = require('node:test');
const assert = require('node:assert/strict');

function fmtVolumeMt(n) {
  if (n == null || n === '') return '\u2014';
  var v = parseFloat(n);
  if (isNaN(v)) return '\u2014';
  return v.toLocaleString('en-PH', { maximumFractionDigits: 3 });
}

test('fmtVolumeMt null and NaN', () => {
  assert.equal(fmtVolumeMt(null), '\u2014');
  assert.equal(fmtVolumeMt(''), '\u2014');
  assert.equal(fmtVolumeMt('x'), '\u2014');
});

test('fmtVolumeMt formats number', () => {
  var s = fmtVolumeMt(1234.5678);
  assert.ok(s.includes('234'), s);
  assert.ok(!s.includes('NaN'));
});
