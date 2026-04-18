// GET /api/sap/sales?period=MTD
// Proxies HQ /api/sales. DSM scoped to district, RSM to region, exec sees all.
const { verifySession, unauthorized } = require('../_lib/auth');
const { callHqApiCached } = require('../_lib/hq-client');
const { applyScopeAndMargins } = require('../_lib/scope');

module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=30');

  const session = await verifySession(req);
  if (!session) return unauthorized(res);

  const params = { period: req.query && req.query.period ? req.query.period : 'MTD' };
  const role = String(session.role || '').toLowerCase();
  if (role === 'dsm' && session.district) { params.scope = 'district'; params.district = session.district; }
  else if (role === 'rsm' && session.region) { params.scope = 'region'; params.region = session.region; }
  else { params.scope = req.query && req.query.scope ? req.query.scope : 'national'; }

  const data = await callHqApiCached('/api/sales', session.id, params);
  if (data && data.error) return res.status(502).json(data);

  const filtered = applyScopeAndMargins(session, data, ['top_customers', 'by_brand', 'by_district', 'by_region', 'monthly_trend']);
  res.status(200).json(filtered);
};
