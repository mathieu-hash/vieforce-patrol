'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { norm } = require('../../api/_lib/org-sync');

test('norm trims and collapses whitespace', () => {
  assert.equal(norm('  Metro   Manila  '), 'Metro Manila');
  assert.equal(norm(''), '');
  assert.equal(norm(null), '');
});
