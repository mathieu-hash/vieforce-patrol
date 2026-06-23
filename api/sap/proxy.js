// api/sap/proxy.js — single function serving every /api/sap/* read.
//
// One serverless function (keeps Patrol under the Vercel function cap) instead
// of 7 separate SAP endpoint files. All /api/sap/* URLs are funnelled here by a
// rewrite in vercel.json ("/api/sap/:path*" -> "/api/sap/proxy?sapPath=:path*"),
// so every existing public URL keeps working with no frontend/test changes.
// The actual handlers live in api/_lib/sap-proxy.js (api/_lib/ is not counted
// as a function by Vercel). All SAP reads still go through the Cloud Run HQ
// proxy (never SAP B1 directly); every payload is margin-stripped.
const P = require('../_lib/sap-proxy');

function decode(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

// Resolve the path segments after /api/sap/, robust to how the request arrives:
//   1. req.query.path    — direct/unit invocation (handler test fast-path)
//   2. req.query.sapPath — the rewrite param ("sales/all" or ["sales","all"])
//   3. req.url parse     — last-resort fallback
function sapSegments(req) {
  const q = req.query || {};

  if (q.path && [].concat(q.path).length) return [].concat(q.path);

  if (q.sapPath) {
    const joined = Array.isArray(q.sapPath) ? q.sapPath.join('/') : String(q.sapPath);
    return joined.split('/').filter(Boolean).map(decode);
  }

  let url = req.url || '';
  const i = url.indexOf('?');
  if (i !== -1) url = url.slice(0, i);
  const marker = '/api/sap/';
  const m = url.indexOf(marker);
  if (m === -1) return [];
  return url.slice(m + marker.length).split('/').filter(Boolean).map(decode);
}

module.exports = async function (req, res) {
  const seg = sapSegments(req);
  const a = seg[0];
  const b = seg[1];

  if (a === 'sales' && b === 'all') return P.salesAll(req, res);
  if (a === 'sales') return P.sales(req, res);
  if (a === 'ar') return P.ar(req, res);
  if (a === 'customers') return P.customers(req, res);
  if (a === 'customer') {
    // /api/sap/customer/:cardcode — surface the segment the way the handler expects.
    req.query = req.query || {};
    req.query.cardcode = b;
    return P.customer(req, res);
  }
  if (a === 'inventory') return P.inventory(req, res);
  if (a === 'speed') return P.speed(req, res);

  res.setHeader('Content-Type', 'application/json');
  return res.status(404).json({ error: 'NOT_FOUND', message: 'Unknown SAP resource' });
};
