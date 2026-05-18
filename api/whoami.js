// GET /api/whoami
// Diagnostic endpoint that returns the egress IP this Vercel serverless invocation
// is using (so we can allowlist it on the SAP MSSQL Azure NSG). Vercel rotates IPs
// per invocation on Hobby/Pro-without-Secure-Compute, so call this several times.
//
// Safe to expose: returns no secrets, only public Vercel telemetry + the public
// outbound IP (which is anyway trivially observable from any service Vercel calls).
//
// Production: disabled unless PATROL_WHOAMI_KEY (or WHOAMI_KEY) is set and caller passes ?key=<same>.
// Non-production: open for local triage (curl without Origin).

module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json');

  const prod =
    process.env.VERCEL_ENV === 'production' ||
    (process.env.NODE_ENV === 'production' && process.env.VERCEL === '1');
  const gateKey = String(process.env.PATROL_WHOAMI_KEY || process.env.WHOAMI_KEY || '').trim();

  if (prod) {
    if (!gateKey) {
      return res.status(404).json({ error: 'Not found' });
    }
    const q = (req && req.query) || {};
    const got = String(q.key == null ? '' : q.key).trim();
    if (got !== gateKey) {
      return res.status(404).json({ error: 'Not found' });
    }
  }

  const meta = {
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
    return res.status(502).json(
      Object.assign({ error: 'IP_LOOKUP_FAILED', message: (err && err.message) || String(err) }, meta)
    );
  }
};
