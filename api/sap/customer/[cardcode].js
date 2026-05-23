// GET /api/sap/customer/:cardcode
// Proxies HQ /api/customer?id=<cardcode> — HQ handles scope gate via scope=user:<uuid>.
//
// Wave 1 (W1-ApiGates): role-gated to managers + admins (HQ still enforces 403
// OUT_OF_SCOPE on top, but Patrol gates first to deny the call cheaply).
const { requireRole } = require('../../_lib/api-auth');
const { callHqProxy } = require('../../_lib/hq-client');
const { stripMarginsIfNeeded, wrapPatrolMeta } = require('../../_lib/scope');

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

  const cardcode = req.query && req.query.cardcode;
  if (!cardcode || typeof cardcode !== 'string' || cardcode.length > 64) {
    return res.status(400).json({ error: 'BAD_CARDCODE' });
  }

  const params = { id: cardcode };

  try {
    const { status, body } = await callHqProxy('/api/customer', session, params);
    if (status === 403) return res.status(403).json(body || { error: 'OUT_OF_SCOPE' });
    if (status === 404) return res.status(404).json(body || { error: 'NOT_FOUND' });
    if (status >= 400) {
      return res.status(status === 504 ? 504 : 502).json({
        error: (body && body.error) || 'HQ upstream error',
        hq_status: status
      });
    }
    const wrapped = wrapPatrolMeta(stripMarginsIfNeeded(body, session), session, params);
    return res.status(200).json(wrapped);
  } catch (err) {
    console.error('[api/sap/customer] HQ call crashed:', (err && err.message) || err);
    return res.status(502).json({ error: 'HQ_UNREACHABLE', message: 'HQ proxy failed' });
  }
};
