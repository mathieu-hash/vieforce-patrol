// GET /api/admin/sap-reps
// Proxies HQ /api/admin/sap-reps — active OSLP reps merged with Supabase users.
//
// Wave 1 (W1-ApiGates): role-gated via requireRole(['admin','ceo','evp','marketing']).
// Replaces inline role allowlist (Audit C P2-1: kill duplicate).

const { requireRole } = require('../_lib/api-auth');
const { callHqProxy } = require('../_lib/hq-client');
const { applyPatrolCors } = require('../_lib/patrol-cors');

const ADMIN_ROLES = ['admin', 'ceo', 'evp', 'marketing'];

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=60');
  applyPatrolCors(req, res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let session;
  try {
    session = await requireRole(req, ADMIN_ROLES);
  } catch (err) {
    const status = (err && err.status) || 401;
    return res.status(status).json({ error: err.code || 'UNAUTHORIZED', message: err.message });
  }

  try {
    const { status, body } = await callHqProxy('/api/admin/sap-reps', session, {});
    return res.status(status).json(body);
  } catch (err) {
    console.error('[api/admin/sap-reps] HQ call crashed:', (err && err.message) || err);
    return res.status(502).json({ error: 'HQ_UNREACHABLE', message: 'HQ proxy failed' });
  }
};
