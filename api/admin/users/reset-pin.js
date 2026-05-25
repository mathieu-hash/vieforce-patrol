// POST /api/admin/users/reset-pin
//
// Admin-only endpoint that updates a target user's PIN. Uses the W1-AuthCore
// contract `requireRole(req, [...])` when that helper is available; otherwise
// falls back to the existing `verifySession` + manual role gate so the route
// is safe to deploy alongside the in-flight W1-AuthCore work.
//
// PIN hashing is deferred per Mat 2026-05-21 (test phase). This wave only
// removes the *exposure surface* — the digit is still stored in the
// `pin_hash` column (legacy name) in plaintext until W1-PinHash lands.
//
// Audit-log: durable row into `public.admin_audit_log`
// (migration 20260525120000_admin_audit_log.sql) PLUS a structured
// console.log for live-tail. Audit-write failures are logged but never
// block the pin reset operation.

const authLib = require('../../_lib/auth');
const { verifySession, unauthorized } = authLib;
const { applyPatrolCors } = require('../../_lib/patrol-cors');
const { sbPatch, sbPost } = require('../../_lib/supabase-service');

const ALLOWED_ROLES = ['admin', 'ceo', 'evp', 'marketing'];
const ALLOWED_ROLES_SET = new Set(ALLOWED_ROLES);

async function gateRequest(req, res) {
  // Prefer W1-AuthCore's requireRole if it's been wired into _lib/auth.js.
  if (typeof authLib.requireRole === 'function') {
    try {
      const session = await authLib.requireRole(req, ALLOWED_ROLES);
      if (!session) return null; // requireRole already wrote the response
      return session;
    } catch (e) {
      // If requireRole throws an HTTPException-style object, surface 401/403.
      const status = (e && e.status) || 500;
      res.status(status).json({ error: e && e.code || 'AUTH_FAILED', message: e && e.message || 'Auth failed' });
      return null;
    }
  }

  // Fallback: pre-W1-AuthCore code path — manual gate via existing helpers.
  const session = await verifySession(req);
  if (!session) {
    unauthorized(res);
    return null;
  }
  const role = String(session.role || '').toLowerCase();
  if (!ALLOWED_ROLES_SET.has(role)) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Admin role required to reset PINs (admin | ceo | evp | marketing)'
    });
    return null;
  }
  return session;
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (_) { return null; }
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  applyPatrolCors(req, res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await gateRequest(req, res);
  if (!session) return; // gateRequest already wrote the error response

  const body = readJsonBody(req);
  if (!body) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid JSON body' });
  }

  const targetUserId = String(body.target_user_id || '').trim();
  const newPin = String(body.new_pin || '').trim();

  if (!targetUserId) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'target_user_id is required' });
  }
  if (!/^\d{4,6}$/.test(newPin)) {
    return res.status(400).json({ error: 'BAD_PIN', message: 'PIN must be 4-6 digits' });
  }

  const filterQuery = 'id=eq.' + encodeURIComponent(targetUserId);
  const patch = {
    pin_hash: newPin, // plaintext per current schema; hashing deferred
    updated_at: new Date().toISOString()
  };

  const result = await sbPatch('users', filterQuery, patch);
  if (!result.ok) {
    console.error('[reset-pin] supabase patch failed', result.status, result.body);
    return res.status(result.status || 500).json(result.body || { error: 'SUPABASE_WRITE_FAILED' });
  }

  // Audit trail. Write durable row into admin_audit_log (migration
  // 20260525120000_admin_audit_log.sql). Vercel logs roll in 24h so the
  // console.log is kept for live-tail but the table is the source of truth.
  // Audit failure must NEVER block the pin reset itself.
  const auditRow = {
    actor_user_id: session.id || null,
    actor_email: session.email || null,
    action: 'pin_reset',
    target_user_id: targetUserId,
    payload: { pin_length: newPin.length }
  };
  try {
    const auditResult = await sbPost('admin_audit_log', auditRow, 'return=minimal');
    if (!auditResult.ok) {
      console.error('[reset-pin] audit log insert failed', auditResult.status, auditResult.body);
    }
  } catch (auditErr) {
    console.error('[reset-pin] audit log threw', auditErr && auditErr.message);
  }

  // Live-tail line kept per ops request — Vercel log search still works for
  // realtime incident triage even with the durable table in place.
  console.log(
    '[AUDIT pin_reset]',
    JSON.stringify({
      ts: new Date().toISOString(),
      actor_id: session.id || null,
      actor_role: session.role || null,
      target_user_id: targetUserId
    })
  );

  return res.status(200).json({ ok: true });
};
