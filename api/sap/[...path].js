// api/sap/[...path].js — single catch-all for every /api/sap/* read.
//
// Vercel counts ONE serverless function for this file regardless of how many
// URLs it serves, which keeps Patrol under the deployment function cap. It
// preserves every existing public URL (/api/sap/sales, /api/sap/customer/:id,
// /api/sap/sales/all, ...) so no frontend or test caller changes. The actual
// handlers live in api/_lib/sap-proxy.js (api/_lib/ is not counted as a
// function by Vercel).
const P = require('../_lib/sap-proxy');

// Resolve the path segments after /api/sap/. We parse req.url rather than rely
// on req.query.path because the identity rewrite in vercel.json ("/(.*)" ->
// "/$1") stops Vercel from binding the [...path] dynamic param. req.query.path
// is kept as a fast-path for direct/unit invocation.
function sapSegments(req) {
  const bound = req.query && req.query.path;
  if (bound && [].concat(bound).length) return [].concat(bound);

  let url = req.url || '';
  const q = url.indexOf('?');
  if (q !== -1) url = url.slice(0, q);
  const marker = '/api/sap/';
  const i = url.indexOf(marker);
  if (i === -1) return [];
  return url.slice(i + marker.length).split('/').filter(Boolean).map(function (s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  });
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
