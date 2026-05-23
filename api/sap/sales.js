// GET /api/sap/sales?period=MTD
// Proxies HQ /api/sales with user scope + margin strip + patrol_meta envelope.
//
// Wave 1 (W1-ApiGates): role-gated to managers + admins (Audit F partial-PASS:
// add explicit role gate atop the existing margin-strip defence-in-depth).
const { requireRole } = require('../_lib/api-auth');
const { callHqProxy } = require('../_lib/hq-client');
const { stripMarginsIfNeeded, wrapPatrolMeta } = require('../_lib/scope');

const SAP_ROLES = ['dsm', 'rsm', 'exec', 'ceo', 'evp', 'admin'];

module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=30');

  let session;
  try {
    session = await requireRole(req, SAP_ROLES);
  } catch (err) {
    const status = (err && err.status) || 401;
    return res.status(status).json({ error: err.code || 'UNAUTHORIZED', message: err.message });
  }

  const params = { period: (req.query && req.query.period) || 'MTD' };

  try {
    const { status, body } = await callHqProxy('/api/sales', session, params);
    if (status >= 400) {
      return res.status(status === 504 ? 504 : 502).json({
        error: (body && body.error) || 'HQ upstream error',
        hq_status: status
      });
    }
    const wrapped = wrapPatrolMeta(stripMarginsIfNeeded(body, session), session, params);
    return res.status(200).json(wrapped);
  } catch (err) {
    console.error('[api/sap/sales] HQ call crashed:', (err && err.message) || err);
    return res.status(502).json({ error: 'HQ_UNREACHABLE', message: 'HQ proxy failed' });
  }
};
