// GET /api/sap/customers?search=&region=&page=1&limit=50&sort=
// Proxies HQ /api/customers. Top-N customer list scoped to the session user.
// Phase D (2026-04-19): refactored onto callHqProxy (Bearer + scope=user:<uuid>).
const { verifySession, unauthorized } = require('../_lib/auth');
const { callHqProxy } = require('../_lib/hq-client');
const { stripMarginsIfNeeded, wrapPatrolMeta } = require('../_lib/scope');

module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=30');

  const session = await verifySession(req);
  if (!session) return unauthorized(res);

  const q = req.query || {};
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.max(1, Math.min(200, parseInt(q.limit, 10) || 50));
  const params = {
    search: q.search || undefined,
    region: q.region || undefined,
    page: page,
    limit: limit,
    sort: q.sort || undefined
  };

  const { status, body } = await callHqProxy('/api/customers', session, params);
  if (status >= 400) {
    return res.status(status === 504 ? 504 : 502).json({
      error: (body && body.error) || 'HQ upstream error',
      hq_status: status
    });
  }

  const wrapped = wrapPatrolMeta(stripMarginsIfNeeded(body, session), session, params);
  return res.status(200).json(wrapped);
};
