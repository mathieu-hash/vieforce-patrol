// GET /api/whoami
// Returns the calling user's identity + diagnostic egress IP / Vercel telemetry.
//
// Wave 1 (W1-ApiGates): now requires a valid session via requireUser. Previous
// PATROL_WHOAMI_KEY query-param gate is removed — auth is the gate. Non-auth
// callers get 401 in every environment (prod or local).
//
// Egress-IP probe to api.ipify.org has try/catch fallback so the endpoint
// never 5xx's just because ipify is briefly down.

const { requireUser } = require('./_lib/api-auth');

module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json');

  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    const status = (err && err.status) || 401;
    return res.status(status).json({ error: err.code || 'UNAUTHORIZED', message: err.message });
  }

  const meta = {
    user: {
      id: user.id,
      role: user.role || null,
      name: user.name || null,
      region: user.region || null,
      district: user.district || null,
      territory: user.territory || null
    },
    project: process.env.VERCEL_PROJECT_PRODUCTION_URL || null,
    region: process.env.VERCEL_REGION || null,
    deployment_url: process.env.VERCEL_URL || null,
    deployment_id: process.env.VERCEL_DEPLOYMENT_ID || null,
    commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    timestamp: new Date().toISOString()
  };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
    clearTimeout(timer);
    const body = await r.json();
    return res.status(200).json(Object.assign({ egress_ip: body && body.ip }, meta));
  } catch (err) {
    // ipify down → still return identity + Vercel meta. Diagnostic-only field.
    return res.status(200).json(Object.assign({ egress_ip: null, egress_ip_error: (err && err.message) || String(err) }, meta));
  }
};
