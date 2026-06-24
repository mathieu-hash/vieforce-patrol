// /api/marketing — consolidated handler for the Marketing Request module.
//
// One serverless function (keeps patrol within the Vercel function cap) that
// routes by `action`:
//   GET  ?action=list                dashboard list (scoped to the caller)
//   GET  ?action=detail&id=<uuid>    one request + approval timeline
//   GET  ?action=config              current routing config (for admin panel)
//   POST  action=submit              DSM submits one or more requests (a session)
//   POST  action=approve             advance to next level  { id, comments? }
//   POST  action=reject              reject at current level { id, reason, comments? }
//   POST  action=config              admin upserts routing { rows:[{config_key,region?,config_value}] }
//
// Authorization is enforced in JS via api/_lib/marketing-engine (canApprove /
// canSee), backed by requireUser (hybrid PIN-session / Google-OAuth). Writes go
// through the service role; RLS is a defense-in-depth backstop only.

const { requireUser, AuthError } = require('./_lib/api-auth');
const { applyPatrolCors } = require('./_lib/patrol-cors');
const { sbGet, sbPost, sbPatch } = require('./_lib/supabase-service');
const { canApprove, canSee, nextStatusOnApprove, LEVEL_FOR_STATUS, VALID_TYPES, VALID_DELIVERY } = require('./_lib/marketing-engine');
const { sendEmail } = require('./_lib/marketing-email');

const CC_FALLBACK = 'aileen.guerrero@vienovo.ph';

function cap(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? (s.length > max ? s.slice(0, max) : s) : null;
}

async function loadConfig() {
  const r = await sbGet('/rest/v1/marketing_config?select=config_key,region,config_value');
  const rows = (r.ok && Array.isArray(r.body)) ? r.body : [];
  const cfg = {
    marketing_email: CC_FALLBACK,
    evp_email: 'joel.durano@vienovo.ph',
    escalation_hours: 24,
    rsm_by_region: {}
  };
  rows.forEach(function (row) {
    if (row.config_key === 'rsm_email' && row.region) cfg.rsm_by_region[row.region] = row.config_value;
    else if (row.config_key === 'marketing_email') cfg.marketing_email = row.config_value;
    else if (row.config_key === 'evp_email') cfg.evp_email = row.config_value;
    else if (row.config_key === 'escalation_hours') cfg.escalation_hours = parseInt(row.config_value, 10) || 24;
  });
  return cfg;
}

function typeLabel(t) {
  return ({
    signages: 'Signages', store_dress_up: 'Store Dress-Up', seminar: 'Seminar',
    vet_mission: 'Vet Mission', vet_products: 'Vet Products',
    feed_sampling: 'Feed Sampling', special_request: 'Special Request'
  })[t] || t;
}

// Write an email_log row whether or not the email actually sent.
async function logEmail(_ref) {
  const ref = _ref || {};
  await sbPost('email_log', [{
    request_id: ref.request_id || null,
    trigger_event: ref.trigger_event,
    to_email: ref.to_email,
    cc_email: ref.cc_email || null,
    subject: ref.subject || null,
    status: (ref.result && ref.result.status) || 'failed',
    error: (ref.result && ref.result.status === 'sent') ? null : ((ref.result && ref.result.error) || null)
  }]);
}

function summaryHtml(reqRow, cfg, extraNote) {
  const lines = [
    '<p><b>Request:</b> ' + reqRow.request_number + '</p>',
    '<p><b>DSM:</b> ' + reqRow.dsm_name + (reqRow.dsm_region ? ' (' + reqRow.dsm_region + ')' : '') + '</p>',
    '<p><b>Type:</b> ' + typeLabel(reqRow.request_type) + '</p>',
    reqRow.distributor_name ? '<p><b>Distributor:</b> ' + reqRow.distributor_name + (reqRow.distributor_location ? ' — ' + reqRow.distributor_location : '') + '</p>' : '',
    '<p><b>Delivery:</b> ' + (reqRow.delivery_method === 'pick_up' ? 'Pick-Up' : 'Thru Customer') + '</p>',
    extraNote ? '<p><i>' + extraNote + '</i></p>' : ''
  ];
  return lines.join('');
}

// Fire the notification appropriate to a status transition + log it.
async function notifyForStatus(reqRow, cfg, extraNote) {
  const cc = cfg.marketing_email;
  const subjBase = '[VieForce] Marketing Request ' + reqRow.request_number;
  let to = null, subject = null, trigger = null;
  switch (reqRow.status) {
    case 'submitted': // -> RSM of region
      to = (reqRow.dsm_region && cfg.rsm_by_region[reqRow.dsm_region]) || cfg.marketing_email;
      subject = subjBase + ' — needs RSM approval';
      trigger = 'submitted';
      break;
    case 'marketing_review':
      to = cfg.marketing_email; subject = subjBase + ' — RSM approved, needs Marketing'; trigger = 'rsm_approved'; break;
    case 'evp_review':
      to = cfg.evp_email; subject = subjBase + ' — Marketing approved, needs EVP'; trigger = 'mktg_approved'; break;
    case 'approved':
      to = reqRow.dsm_email || null; subject = subjBase + ' is APPROVED'; trigger = 'evp_approved'; break;
    case 'rejected':
      to = reqRow.dsm_email || null; subject = subjBase + ' has been RETURNED'; trigger = 'rejected'; break;
    default: return;
  }
  if (!to) return; // nothing to send to (e.g. DSM has no email on file)
  const html = summaryHtml(reqRow, cfg, extraNote);
  const result = await sendEmail({ to: to, cc: cc, subject: subject, html: html });
  await logEmail({ request_id: reqRow.id, trigger_event: trigger, to_email: to, cc_email: cc, subject: subject, result: result });
}

module.exports = async function handler(req, res) {
  applyPatrolCors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    const status = (err && err.status) || 401;
    return res.status(status).json({ error: err.code || 'UNAUTHORIZED', message: err.message });
  }

  const method = (req.method || '').toUpperCase();
  const action = method === 'GET'
    ? (req.query && req.query.action) || 'list'
    : (req.body && req.body.action) || (((typeof req.body === 'string') ? safeParse(req.body) : {}) || {}).action;

  try {
    if (method === 'GET' && action === 'list') return await handleList(req, res, user);
    if (method === 'GET' && action === 'detail') return await handleDetail(req, res, user);
    if (method === 'GET' && action === 'config') return await handleGetConfig(req, res, user);
    if (method === 'POST' && action === 'submit') return await handleSubmit(req, res, user);
    if (method === 'POST' && action === 'approve') return await handleApprove(req, res, user);
    if (method === 'POST' && action === 'reject') return await handleReject(req, res, user);
    if (method === 'POST' && action === 'config') return await handleSetConfig(req, res, user);
    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('[api/marketing]', action, (err && err.message) || err);
    return res.status(500).json({ error: 'marketing_error', message: (err && err.message) || 'failed' });
  }
};

function safeParse(s) { try { return JSON.parse(s); } catch (_) { return {}; } }
function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return safeParse(req.body);
}

async function handleList(req, res, user) {
  // Cheap + safe: fetch a recent window, filter in JS via canSee. Dashboards
  // are manager-facing and low-volume; paginate later if needed.
  const r = await sbGet('/rest/v1/marketing_requests?order=submitted_at.desc&limit=200'
    + '&select=id,request_number,status,request_type,dsm_name,dsm_region,dsm_user_id,distributor_name,distributor_location,submitted_at,rejected_by_level');
  if (!r.ok) return res.status(502).json({ error: 'list_failed', message: r.body && r.body.message });
  const rows = (Array.isArray(r.body) ? r.body : []).filter(function (row) { return canSee(row, user); });
  return res.status(200).json({ rows: rows });
}

async function handleDetail(req, res, user) {
  const id = req.query && req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });
  const r = await sbGet('/rest/v1/marketing_requests?id=eq.' + encodeURIComponent(id) + '&limit=1');
  if (!r.ok || !Array.isArray(r.body) || !r.body.length) return res.status(404).json({ error: 'not_found' });
  const row = r.body[0];
  if (!canSee(row, user)) return res.status(403).json({ error: 'forbidden' });
  const logRes = await sbGet('/rest/v1/approval_log?request_id=eq.' + encodeURIComponent(id) + '&order=actioned_at.asc');
  row.approval_log = (logRes.ok && Array.isArray(logRes.body)) ? logRes.body : [];
  return res.status(200).json({ row: row });
}

async function handleSubmit(req, res, user) {
  const b = bodyOf(req);
  const dist = b.distributor || {};
  const delivery = b.delivery_method;
  if (VALID_DELIVERY.indexOf(delivery) === -1) return res.status(400).json({ error: 'invalid delivery_method' });
  let items = Array.isArray(b.items) ? b.items : (b.items ? [b.items] : []);
  if (!items.length) return res.status(400).json({ error: 'no request items' });

  const sessionId = b.session_id || ('mrs-' + Date.now());

  const rows = items.map(function (it) {
    if (VALID_TYPES.indexOf(it.type) === -1) return null;
    return {
      session_id: sessionId,
      dsm_user_id: user.id || null,
      dsm_name: user.name || 'Unknown',
      dsm_email: user.email || null,
      dsm_region: user.region || null,
      distributor_name: cap(dist.name, 200),
      distributor_contact: cap(dist.contact, 60),
      distributor_location: cap(dist.location, 120),
      delivery_method: delivery,
      request_type: it.type,
      request_details: it.details || {},
      other_instructions: cap(it.other_instructions, 1000),
      photo_url: cap(it.photo_url, 500),
      status: 'submitted'
    };
  }).filter(Boolean);

  if (!rows.length) return res.status(400).json({ error: 'no valid request items' });

  const insert = await sbPost('marketing_requests', rows, 'return=representation');
  if (!insert.ok) return res.status(502).json({ error: 'insert_failed', message: insert.body && insert.body.message });

  const cfg = await loadConfig();
  const created = Array.isArray(insert.body) ? insert.body : [];
  // Notify the RSM (by region) for each new request.
  for (let i = 0; i < created.length; i++) {
    try { await notifyForStatus(created[i], cfg, null); } catch (_) {}
  }
  return res.status(201).json({ created: created.length, session_id: sessionId, rows: created });
}

async function loadOne(id) {
  const r = await sbGet('/rest/v1/marketing_requests?id=eq.' + encodeURIComponent(id) + '&limit=1');
  if (!r.ok || !Array.isArray(r.body) || !r.body.length) return null;
  return r.body[0];
}

async function handleApprove(req, res, user) {
  const b = bodyOf(req);
  const row = await loadOne(b.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const gate = canApprove(row, user);
  if (!gate.allowed) return res.status(403).json({ error: 'forbidden', reason: gate.reason });

  const next = nextStatusOnApprove(row.status);
  const patch = { status: next, updated_at: new Date().toISOString(), rejection_reason: null, rejected_by_level: null };
  const upd = await sbPatch('marketing_requests', 'id=eq.' + encodeURIComponent(b.id), patch);
  if (!upd.ok || !Array.isArray(upd.body) || !upd.body.length) return res.status(502).json({ error: 'update_failed' });
  const updated = upd.body[0];

  await sbPost('approval_log', [{
    request_id: updated.id, approver_id: user.id || null, approver_name: user.name || 'Unknown',
    approver_email: user.email || null, approver_level: gate.level, action: 'approved',
    comments: cap(b.comments, 1000)
  }]);

  const cfg = await loadConfig();
  try { await notifyForStatus(updated, cfg, null); } catch (_) {}
  return res.status(200).json({ row: updated });
}

async function handleReject(req, res, user) {
  const b = bodyOf(req);
  if (!b.reason || !String(b.reason).trim()) return res.status(400).json({ error: 'reason required to reject' });
  const row = await loadOne(b.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const gate = canApprove(row, user);
  if (!gate.allowed) return res.status(403).json({ error: 'forbidden', reason: gate.reason });

  const level = LEVEL_FOR_STATUS[row.status];
  const patch = { status: 'rejected', rejected_by_level: level, rejection_reason: cap(b.reason, 1000), updated_at: new Date().toISOString() };
  const upd = await sbPatch('marketing_requests', 'id=eq.' + encodeURIComponent(b.id), patch);
  if (!upd.ok || !Array.isArray(upd.body) || !upd.body.length) return res.status(502).json({ error: 'update_failed' });
  const updated = upd.body[0];

  await sbPost('approval_log', [{
    request_id: updated.id, approver_id: user.id || null, approver_name: user.name || 'Unknown',
    approver_email: user.email || null, approver_level: level, action: 'rejected',
    comments: cap(b.comments, 1000)
  }]);

  const cfg = await loadConfig();
  try { await notifyForStatus(updated, cfg, 'Reason: ' + String(b.reason)); } catch (_) {}
  return res.status(200).json({ row: updated });
}

async function handleGetConfig(_req, res, user) {
  if (String(user.role || '').toLowerCase() !== 'admin' &&
      String(user.role || '').toLowerCase() !== 'marketing') {
    return res.status(403).json({ error: 'forbidden' });
  }
  const cfg = await loadConfig();
  return res.status(200).json({ config: cfg });
}

async function handleSetConfig(req, res, user) {
  if (String(user.role || '').toLowerCase() !== 'admin') {
    return res.status(403).json({ error: 'admin only' });
  }
  const b = bodyOf(req);
  const rows = Array.isArray(b.rows) ? b.rows : [];
  const clean = rows.map(function (r) {
    return { config_key: cap(r.config_key, 60), region: cap(r.region, 80), config_value: cap(r.config_value, 200) };
  }).filter(function (r) { return r.config_key && r.config_value; });
  if (!clean.length) return res.status(400).json({ error: 'no rows' });
  const up = await sbPost('marketing_config', clean, 'return=representation,resolution=merge-duplicates', 'config_key,region');
  if (!up.ok) return res.status(502).json({ error: 'upsert_failed', message: up.body && up.body.message });
  return res.status(200).json({ saved: Array.isArray(up.body) ? up.body.length : 0 });
}
