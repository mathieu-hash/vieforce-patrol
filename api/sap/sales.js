// GET /api/sap/sales?period=MTD
// Proxies HQ /api/sales with user scope + margin strip + patrol_meta envelope.
// Phase D (2026-04-19): refactored onto callHqProxy (Bearer + scope=user:<uuid>).
const { verifySession, unauthorized } = require('../_lib/auth');
const { callHqProxy } = require('../_lib/hq-client');
const { stripMarginsIfNeeded, wrapPatrolMeta } = require('../_lib/scope');

module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=30');

  const session = await verifySession(req);
  if (!session) return unauthorized(res);

  const params = { period: (req.query && req.query.period) || 'MTD' };

  const { status, body } = await callHqProxy('/api/sales', session, params);
  if (status >= 400) {
    return res.status(status === 504 ? 504 : 502).json({
      error: (body && body.error) || 'HQ upstream error',
      hq_status: status
    });
  }

  const wrapped = wrapPatrolMeta(stripMarginsIfNeeded(body, session), session, params);
  return res.status(200).json(wrapped);
};
