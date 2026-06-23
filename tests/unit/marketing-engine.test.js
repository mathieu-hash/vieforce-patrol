const test = require('node:test');
const assert = require('node:assert');
const {
  canApprove, canSee, nextStatusOnApprove, VALID_TYPES
} = require('../../api/_lib/marketing-engine');

test('canApprove: RSM approves own region at submitted; blocked elsewhere', () => {
  const req = { status: 'submitted', dsm_region: 'Visayas', dsm_user_id: 'u-dsm' };
  assert.strictEqual(canApprove(req, { id: 'r1', role: 'rsm', region: 'Visayas' }).allowed, true);
  assert.strictEqual(canApprove(req, { id: 'r2', role: 'rsm', region: 'Luzon' }).allowed, false);   // wrong region
  assert.strictEqual(canApprove(req, { id: 'm1', role: 'marketing', region: 'Visayas' }).allowed, false); // wrong level
  assert.strictEqual(canApprove(req, { id: 'r3', role: 'rsm' }).allowed, false);                     // no region
});

test('canApprove: Marketing approves at marketing_review only', () => {
  const req = { status: 'marketing_review', dsm_region: 'Visayas', dsm_user_id: 'u-dsm' };
  assert.strictEqual(canApprove(req, { id: 'm1', role: 'marketing' }).allowed, true);
  assert.strictEqual(canApprove(req, { id: 'r1', role: 'rsm', region: 'Visayas' }).allowed, false);
  // RSM's own-region item is no longer approvable by them once it advanced
  const submitted = { status: 'submitted', dsm_region: 'Visayas' };
  assert.strictEqual(canApprove(submitted, { id: 'm1', role: 'marketing' }).allowed, false);
});

test('canApprove: EVP (db role exec) approves at evp_review', () => {
  const req = { status: 'evp_review', dsm_region: 'Visayas', dsm_user_id: 'u-dsm' };
  assert.strictEqual(canApprove(req, { id: 'e1', role: 'exec' }).allowed, true);
  assert.strictEqual(canApprove(req, { id: 'e2', role: 'evp' }).allowed, true);
  assert.strictEqual(canApprove(req, { id: 'm1', role: 'marketing' }).allowed, false);
});

test('canApprove: admin can act at any pending level; nothing to do on approved/rejected', () => {
  const admin = { id: 'a1', role: 'admin' };
  assert.strictEqual(canApprove({ status: 'submitted', dsm_region: 'X' }, admin).allowed, true);
  assert.strictEqual(canApprove({ status: 'marketing_review' }, admin).allowed, true);
  assert.strictEqual(canApprove({ status: 'evp_review' }, admin).allowed, true);
  assert.strictEqual(canApprove({ status: 'approved' }, admin).allowed, false);
  assert.strictEqual(canApprove({ status: 'rejected' }, admin).allowed, false);
});

test('nextStatusOnApprove advances the 3-level chain', () => {
  assert.strictEqual(nextStatusOnApprove('submitted'), 'marketing_review');
  assert.strictEqual(nextStatusOnApprove('marketing_review'), 'evp_review');
  assert.strictEqual(nextStatusOnApprove('evp_review'), 'approved');
  assert.strictEqual(nextStatusOnApprove('approved'), null);
  assert.strictEqual(nextStatusOnApprove('rejected'), null);
});

test('canSee scoping', () => {
  const own = { status: 'submitted', dsm_region: 'Visayas', dsm_user_id: 'me' };
  const other = { status: 'submitted', dsm_region: 'Luzon', dsm_user_id: 'someone' };
  const dsm = { id: 'me', role: 'dsm' };
  assert.strictEqual(canSee(own, dsm), true);
  assert.strictEqual(canSee(other, dsm), false);
  assert.strictEqual(canSee(other, { id: 'm', role: 'marketing' }), true);        // marketing sees all
  assert.strictEqual(canSee(own, { id: 'r', role: 'rsm', region: 'Visayas' }), true);
  assert.strictEqual(canSee(other, { id: 'r', role: 'rsm', region: 'Visayas' }), false); // other region
  // EVP only sees items at/after their level
  assert.strictEqual(canSee({ status: 'submitted', dsm_region: 'V' }, { id: 'e', role: 'exec' }), false);
  assert.strictEqual(canSee({ status: 'evp_review' }, { id: 'e', role: 'exec' }), true);
  assert.strictEqual(canSee({ status: 'approved' }, { id: 'e', role: 'exec' }), true);
});

test('VALID_TYPES covers the 7 spec request types', () => {
  assert.strictEqual(VALID_TYPES.length, 7);
  assert.ok(VALID_TYPES.indexOf('special_request') !== -1);
});
