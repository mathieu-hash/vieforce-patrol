const test = require('node:test');
const assert = require('node:assert/strict');
const { patrolCorsHeaders } = require('../../api/_lib/patrol-cors.js');

test('patrolCorsHeaders sets Allow-Origin for default Vercel app', () => {
  const h = patrolCorsHeaders(
    { headers: { origin: 'https://vieforce-patrol.vercel.app' } },
    'GET, OPTIONS'
  );
  assert.equal(h['Access-Control-Allow-Origin'], 'https://vieforce-patrol.vercel.app');
  assert.equal(h.Vary, 'Origin');
});

test('patrolCorsHeaders omits Allow-Origin for unknown origin', () => {
  const h = patrolCorsHeaders({ headers: { origin: 'https://attacker.example' } }, 'POST, OPTIONS');
  assert.equal(h['Access-Control-Allow-Origin'], undefined);
});
