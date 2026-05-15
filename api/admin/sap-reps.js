// GET /api/admin/sap-reps
// Proxies HQ /api/admin/sap-reps — active OSLP reps merged with Supabase users.
// Patrol gate: User Admin roles only — ceo | admin | evp | marketing.

const { verifySession, unauthorized } = require('../_lib/auth');
const { callHqProxy } = require('../_lib/hq-client');

// Matches Patrol User Admin gate: CEO, Sales Admin (admin), EVP Sales (evp), Marketing Manager (marketing).
const USER_ADMIN_ROLES = new Set(['ceo', 'admin', 'evp', 'marketing']);

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-session-id, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await verifySession(req);
  if (!session) return unauthorized(res);

  const role = String(session.role || '').toLowerCase();
  if (!USER_ADMIN_ROLES.has(role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'User Admin access required (CEO, Sales Admin, EVP Sales, Marketing Manager)'
    });
  }

  const { status, body } = await callHqProxy('/api/admin/sap-reps', session, {});
  return res.status(status).json(body);
};
