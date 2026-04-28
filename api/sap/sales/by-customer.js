// GET /api/sap/sales/by-customer?period=MTD|YTD
// Direct SAP B1 MSSQL query, scoped by user's SlpCode.
// Volume-only (bags). No margin.
const { verifySession, unauthorized } = require('../../_lib/auth');
const { querySelect, sql } = require('../../_lib/sap-mssql');
const Q = require('../../_lib/sales-queries');

module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=30');

  const session = await verifySession(req);
  if (!session) return unauthorized(res);

  const period = Q.normalizePeriod(req.query && req.query.period);
  const slpCode = parseInt(session.sap_slpcode, 10);

  const meta = {
    user_id: session.id,
    role: session.role,
    period: period,
    is_empty: !Number.isFinite(slpCode),
    fetched_at: new Date().toISOString()
  };

  if (!Number.isFinite(slpCode)) {
    return res.status(200).json({ patrol_meta: meta, by_customer: [] });
  }

  try {
    const rows = await querySelect(Q.byCustomerSql(period), [
      { name: 'slpCode', type: sql.Int, value: slpCode }
    ]);

    const byCustomer = rows.map((r) => ({
      cardcode: r.CardCode,
      name: r.CardName,
      bags: Number(r.bags) || 0
    }));

    return res.status(200).json({ patrol_meta: meta, by_customer: byCustomer });
  } catch (err) {
    console.error('[sap/sales/by-customer]', err && err.message);
    return res
      .status(502)
      .json({ patrol_meta: meta, error: 'SAP query failed', message: (err && err.message) || String(err) });
  }
};
