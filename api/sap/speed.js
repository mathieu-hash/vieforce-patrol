// GET /api/sap/speed
// Proxies HQ /api/speed (daily pullout / velocity).
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

  const data = await callHqApiCached('/api/speed', session.id, params);
  if (data && data.error) return res.status(502).json(data);

  const filtered = applyScopeAndMargins(session, data, ['by_district', 'by_region', 'top_movers']);
  res.status(200).json(filtered);
};
