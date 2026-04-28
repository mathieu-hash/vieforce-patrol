// Unit tests for patrolIsLikelyDuplicateInsertError (js/db.js) — offline idempotency helper.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'db.js'), 'utf8');
const fnMatch = src.match(/function patrolIsLikelyDuplicateInsertError[^{]*\{[\s\S]+?\n\}/);
if (!fnMatch) throw new Error('could not locate patrolIsLikelyDuplicateInsertError in js/db.js');

const patrolIsLikelyDuplicateInsertError = vm.runInThisContext(
  '(' + fnMatch[0].replace('function patrolIsLikelyDuplicateInsertError', 'function') + ')'
);

test('detects duplicate key phrasing', () => {
  assert.equal(patrolIsLikelyDuplicateInsertError(new Error('duplicate key value violates unique constraint')), true);
});

test('detects Postgres 23505 in message', () => {
  assert.equal(patrolIsLikelyDuplicateInsertError(new Error('23505: unique_violation')), true);
});

test('ignores generic errors', () => {
  assert.equal(patrolIsLikelyDuplicateInsertError(new Error('PGRST204: column not found')), false);
  assert.equal(patrolIsLikelyDuplicateInsertError(new Error('network timeout')), false);
});
