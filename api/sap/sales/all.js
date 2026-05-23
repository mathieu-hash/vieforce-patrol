// GET /api/sap/sales/all?period=MTD|YTD
// Single round-trip: bags + by_brand + by_customer + whitespace + at_risk.
//
// History: this endpoint used to require('mssql') and connect directly to
// analytics.vienovo.ph:4444. That broke production in two compounding ways:
//   1. mssql wasn't in package.json — require() crashed at module load,
//      Vercel returned 500 FUNCTION_INVOCATION_FAILED.
//   2. Vercel egress IPs aren't in the Azure NSG allowlist for the SAP server.
// The fix is to proxy through HQ Cloud Run (which IS allowlisted) using the
// same callHqProxy pattern as api/sap/sales.js, api/sap/ar.js, etc.
//
// Wave 1 (W1-ApiGates, Audit C P0-S5): added the missing
// stripMarginsIfNeeded() call. The hand-mapped reshape only picked
// `volume_bags` from each row but forwarded HQ's `scope`, `whitespace`, and
// `at_risk` arrays untouched — which could carry margin keys. The README
// margin contract requires every /api/sap/* response payload to be
// margin-stripped, regardless of role.
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

  const period = (req.query && req.query.period) || 'MTD';
  const params = { period: period, include: 'whitespace,at_risk' };

  let status, body;
  try {
    ({ status, body } = await callHqProxy('/api/sales', session, params));
  } catch (err) {
    console.error('[api/sap/sales/all] HQ call crashed:', (err && err.message) || err);
    return res.status(502).json({ error: 'HQ_UNREACHABLE', message: 'HQ proxy failed' });
  }

  if (status >= 400) {
    return res.status(status === 504 ? 504 : 502).json({
      error: (body && body.error) || 'HQ upstream error',
      hq_status: status,
      message: status === 504
        ? 'HQ timeout — try again in a moment.'
        : 'SAP server unreachable via HQ. Try again in a moment.'
    });
  }

  // Re-shape HQ payload into the shape patrol's Sales tab UI consumes.
  // HQ returns:
  //   { kpis: { volume_bags, volume_mt, ... },
  //     by_brand: [{ brand, volume_bags, ... }],
  //     top_customers: [{ customer_code, customer_name, volume_bags, ... }],
  //     whitespace: [{ cardcode, name, phone }],
  //     at_risk:    [{ cardcode, name, last_date, days_since_last_order, tier }] }
  const total_bags = (body.kpis && body.kpis.volume_bags) || 0;

  const by_brand = (body.by_brand || []).slice(0, 5).map(function (b) {
    return {
      name: b.brand || '(no brand)',
      bags: Number(b.volume_bags) || 0
    };
  });

  const by_customer = (body.top_customers || []).slice(0, 5).map(function (c) {
    return {
      cardcode: c.customer_code,
      name: c.customer_name,
      bags: Number(c.volume_bags) || 0
    };
  });

  const whitespace = body.whitespace || [];
  const at_risk    = body.at_risk    || [];

  // Margin-strip the assembled payload (Audit C P0-S5 fix).
  // stripMarginsIfNeeded mutates in place and returns the same reference.
  const payload = {
    kpis: { bags: total_bags },
    by_brand: by_brand,
    by_customer: by_customer,
    whitespace: whitespace,
    at_risk: at_risk,
    scope: body.scope
  };
  stripMarginsIfNeeded(payload, session);

  const wrapped = wrapPatrolMeta(payload, session, { period: period });
  return res.status(200).json(wrapped);
};
