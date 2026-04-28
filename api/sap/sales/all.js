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
const { verifySession, unauthorized } = require('../../_lib/auth');
const { callHqProxy } = require('../../_lib/hq-client');
const { wrapPatrolMeta } = require('../../_lib/scope');

module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=30');

  const session = await verifySession(req);
  if (!session) return unauthorized(res);

  const period = (req.query && req.query.period) || 'MTD';
  const params = { period: period, include: 'whitespace,at_risk' };

  const { status, body } = await callHqProxy('/api/sales', session, params);
  if (status >= 400) {
    return res.status(status === 504 ? 504 : 502).json({
      error: (body && body.error) || 'HQ upstream error',
      hq_status: status,
      message: status === 504
        ? 'HQ timeout — try again in a moment.'
        : 'SAP server unreachable via HQ. Try again in a moment.'
    });
  }

  // Re-shape HQ payload into the shape patrol's Sales tab UI expects.
  // HQ returns:
  //   { kpis: { volume_bags, volume_mt, ... },
  //     by_brand: [{ brand, volume_bags, ... }],
  //     top_customers: [{ customer_code, customer_name, volume_bags, ... }],
  //     whitespace: [{ cardcode, name, phone }],   // only if include= sent
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

  // whitespace + at_risk pass through unchanged — HQ returns them in the
  // exact shape the UI consumes (designed in 2026-04-28 HQ change).
  const whitespace = body.whitespace || [];
  const at_risk    = body.at_risk    || [];

  // Forward HQ scope so wrapPatrolMeta can populate patrol_meta.hq_scope + is_empty.
  const wrapped = wrapPatrolMeta({
    kpis: { bags: total_bags },
    by_brand: by_brand,
    by_customer: by_customer,
    whitespace: whitespace,
    at_risk: at_risk,
    scope: body.scope
  }, session, { period: period });

  return res.status(200).json(wrapped);
};
