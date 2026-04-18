// GET /api/sap/customers?limit=50
// Proxies HQ /api/customers. Returns the top-N customer list scoped to the user.
const { verifySession, unauthorized } = require('../_lib/auth');
const { callHqApiCached } = require('../_lib/hq-client');
const { applyScopeAndMargins, isElevated, filterRowsByScope, stripMargins } = require('../_lib/scope');

module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=30');

  const session = await verifySession(req);
  if (!session) return unauthorized(res);

  const limit = Math.max(1, Math.min(500, parseInt(req.query && req.query.limit, 10) || 50));
  const params = { limit };
  const role = String(session.role || '').toLowerCase();
  if (role === 'dsm' && session.district) { params.scope = 'district'; params.district = session.district; }
  else if (role === 'rsm' && session.region) { params.scope = 'region'; params.region = session.region; }

  const data = await callHqApiCached('/api/customers', session.id, params);
  if (data && data.error) return res.status(502).json(data);

  // HQ may return the rows at top level OR under .customers — handle both.
  if (Array.isArray(data)) {
    let out = isElevated(session.role) ? data : filterRowsByScope(data, session);
    if (!isElevated(session.role)) stripMargins(out);
    return res.status(200).json(out);
  }
  const filtered = applyScopeAndMargins(session, data, ['customers', 'top_customers', 'rows']);
  res.status(200).json(filtered);
};
