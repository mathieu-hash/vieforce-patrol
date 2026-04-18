// GET /api/sap/ar
// Proxies HQ /api/ar. Scopes the customer list to the user's district/region.
const { verifySession, unauthorized } = require('../_lib/auth');
const { callHqApiCached } = require('../_lib/hq-client');
const { applyScopeAndMargins } = require('../_lib/scope');

module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=30');

  const session = await verifySession(req);
  if (!session) return unauthorized(res);

  const params = {};
  const role = String(session.role || '').toLowerCase();
  if (role === 'dsm' && session.district) { params.scope = 'district'; params.district = session.district; }
  else if (role === 'rsm' && session.region) { params.scope = 'region'; params.region = session.region; }

  const data = await callHqApiCached('/api/ar', session.id, params);
  if (data && data.error) return res.status(502).json(data);

  const filtered = applyScopeAndMargins(session, data, ['customers', 'top_overdue', 'aging_buckets']);
  res.status(200).json(filtered);
};
