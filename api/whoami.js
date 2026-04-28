// GET /api/whoami
// Diagnostic endpoint that returns the egress IP this Vercel serverless invocation
// is using (so we can allowlist it on the SAP MSSQL Azure NSG). Vercel rotates IPs
// per invocation on Hobby/Pro-without-Secure-Compute, so call this several times.
//
// Safe to expose: returns no secrets, only public Vercel telemetry + the public
// outbound IP (which is anyway trivially observable from any service Vercel calls).
// Deliberately no auth so it can be hit with curl during deploys / triage.
//
// Remove this endpoint (or gate it behind a token) once a durable solution is in
// place (Vercel Secure Compute, bastion VM, or Cloudflare Tunnel).

module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json');

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
