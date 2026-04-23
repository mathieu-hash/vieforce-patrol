// GET /api/sap/customer/:cardcode
// Proxies HQ /api/customer?id=<cardcode> — HQ handles scope gate via scope=user:<uuid>.
// Phase D (2026-04-19): refactored onto callHqProxy.
// Patrol-side RBAC removed — HQ returns 403/404/is_empty for out-of-scope customers.
const { verifySession, unauthorized } = require('../../_lib/auth');
const { callHqProxy } = require('../../_lib/hq-client');
const { stripMarginsIfNeeded, wrapPatrolMeta } = require('../../_lib/scope');

module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=30');

  const session = await verifySession(req);
  if (!session) return unauthorized(res);

  const cardcode = req.query && req.query.cardcode;
  if (!cardcode || typeof cardcode !== 'string' || cardcode.length > 64) {
    return res.status(400).json({ error: 'BAD_CARDCODE' });
  }

  const params = { id: cardcode };

  const { status, body } = await callHqProxy('/api/customer', session, params);
  if (status === 403) return res.status(403).json(body || { error: 'OUT_OF_SCOPE' });
  if (status === 404) return res.status(404).json(body || { error: 'NOT_FOUND' });
  if (status >= 400) {
    return res.status(status === 504 ? 504 : 502).json({
      error: (body && body.error) || 'HQ upstream error',
      hq_status: status
    });
  }

  const wrapped = wrapPatrolMeta(stripMarginsIfNeeded(body, session), session, params);
  return res.status(200).json(wrapped);
};
