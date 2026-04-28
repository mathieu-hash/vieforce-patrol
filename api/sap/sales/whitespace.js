// GET /api/sap/sales/whitespace
// BPs in scope with no MTD invoices. Field-action prompt for DSM/RSM.
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
    return res.status(200).json({ patrol_meta: meta, whitespace: [] });
  }

  try {
    const rows = await querySelect(Q.whitespaceSql(), [
      { name: 'slpCode', type: sql.Int, value: slpCode }
    ]);

    const whitespace = rows.map((r) => ({
      cardcode: r.CardCode,
      name: r.CardName,
      phone: r.Phone1 || null
    }));

    return res.status(200).json({ patrol_meta: meta, whitespace: whitespace });
  } catch (err) {
    console.error('[sap/sales/whitespace]', err && err.message);
    return res
      .status(502)
      .json({ patrol_meta: meta, error: 'SAP query failed', message: (err && err.message) || String(err) });
  }
};
