// GET /api/sap/sales/all?period=MTD|YTD
// Single round-trip: by_customer + whitespace + at_risk in parallel.
// Replaces the 3 individual cold-starts the Sales tab was firing.
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
    return res.status(200).json({
      patrol_meta: meta,
      kpis: { bags: 0 },
      by_brand: [],
      by_customer: [],
      whitespace: [],
      at_risk: []
    });
  }

  const params = [{ name: 'slpCode', type: sql.Int, value: slpCode }];

  try {
    const [totalRows, byBrandRows, byCustomerRows, whitespaceRows, atRiskRows] = await Promise.all([
      querySelect(Q.totalBagsSql(period), params),
      querySelect(Q.byBrandSql(period), params),
      querySelect(Q.byCustomerSql(period), params),
      querySelect(Q.whitespaceSql(), params),
      querySelect(Q.atRiskSql(), params)
    ]);

    const total_bags = (totalRows && totalRows[0] && Number(totalRows[0].total_bags)) || 0;

    const by_brand = byBrandRows.map((r) => ({
      name: r.brand || '(no brand)',
      bags: Number(r.bags) || 0
    }));

    const by_customer = byCustomerRows.map((r) => ({
      cardcode: r.CardCode,
      name: r.CardName,
      bags: Number(r.bags) || 0
    }));

    const whitespace = whitespaceRows.map((r) => ({
      cardcode: r.CardCode,
      name: r.CardName,
      phone: r.Phone1 || null
    }));

    const at_risk = atRiskRows.map((r) => {
      const days = r.days_since == null ? null : Number(r.days_since);
      return {
        cardcode: r.CardCode,
        name: r.CardName,
        last_date: r.last_date ? new Date(r.last_date).toISOString().slice(0, 10) : null,
        days_since_last_order: days,
        tier: Q.tierFromDaysSince(days)
      };
    });

    return res.status(200).json({
      patrol_meta: meta,
      kpis: { bags: total_bags },
      by_brand,
      by_customer,
      whitespace,
      at_risk
    });
  } catch (err) {
    const msg = (err && err.message) || String(err);
    console.error('[sap/sales/all]', msg);
    const friendly = /Failed to connect|ECONNREFUSED|timeout/i.test(msg)
      ? 'SAP server unreachable. Try again in a moment.'
      : 'SAP query failed.';
    return res.status(502).json({
      patrol_meta: meta,
      error: 'SAP_UNAVAILABLE',
      message: friendly,
      detail: msg
    });
  }
};
