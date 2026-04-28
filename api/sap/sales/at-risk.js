// GET /api/sap/sales/at-risk
// BPs whose last invoice is > 14 days ago. Tiered: slowing / at_risk / no_history.
const { verifySession, unauthorized } = require('../../_lib/auth');
const { querySelect, sql } = require('../../_lib/sap-mssql');
const Q = require('../../_lib/sales-queries');

module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=60');

  const session = await verifySession(req);
  if (!session) return unauthorized(res);

  const slpCode = parseInt(session.sap_slpcode, 10);
  const meta = {
    user_id: session.id,
    role: session.role,
    is_empty: !Number.isFinite(slpCode),
    fetched_at: new Date().toISOString()
  };

  if (!Number.isFinite(slpCode)) {
    return res.status(200).json({ patrol_meta: meta, at_risk: [] });
  }

  try {
    const rows = await querySelect(Q.atRiskSql(), [
      { name: 'slpCode', type: sql.Int, value: slpCode }
    ]);

    const atRisk = rows.map((r) => {
      const days = r.days_since == null ? null : Number(r.days_since);
      return {
        cardcode: r.CardCode,
        name: r.CardName,
        last_date: r.last_date ? new Date(r.last_date).toISOString().slice(0, 10) : null,
        days_since_last_order: days,
        tier: Q.tierFromDaysSince(days)
      };
    });

    return res.status(200).json({ patrol_meta: meta, at_risk: atRisk });
  } catch (err) {
    console.error('[sap/sales/at-risk]', err && err.message);
    return res
      .status(502)
      .json({ patrol_meta: meta, error: 'SAP query failed', message: (err && err.message) || String(err) });
  }
};
