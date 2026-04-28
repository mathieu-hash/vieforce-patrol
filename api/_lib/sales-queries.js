// Pure SQL builders for the Sales tab (DSM/RSM mobile).
// All queries scoped by SlpCode (single-DSM today). Volume-only, no margins.
// Kept separate from the connection layer so unit tests can snapshot the SQL.

const PERIODS = { MTD: 'MTD', YTD: 'YTD' };

function normalizePeriod(p) {
  var u = String(p || 'MTD').toUpperCase();
  return PERIODS[u] ? u : 'MTD';
}

/** SQL fragment producing the start-of-period date for OINV.DocDate filtering. */
function _periodStartExpr(period) {
  if (period === 'YTD') return 'DATEFROMPARTS(YEAR(GETDATE()), 1, 1)';
  return 'DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)';
}

function totalBagsSql(period) {
  var p = normalizePeriod(period);
  return (
    'SELECT ISNULL(SUM(d.Quantity), 0) AS total_bags ' +
    'FROM OINV o JOIN INV1 d ON d.DocEntry = o.DocEntry ' +
    'WHERE o.SlpCode = @slpCode ' +
    "  AND o.CANCELED = 'N' " +
    '  AND o.DocDate >= ' + _periodStartExpr(p)
  );
}

function byBrandSql(period) {
  var p = normalizePeriod(period);
  // OITM.U_Brand is the canonical brand UDF; fall back to OITG.ItmsGrpNam for ungrouped items.
  // Empty / whitespace-only U_Brand is treated as missing and falls back.
  return (
    'SELECT TOP 5 ' +
    "  COALESCE(NULLIF(LTRIM(RTRIM(i.U_Brand)), ''), g.ItmsGrpNam, '(no brand)') AS brand, " +
    '  SUM(d.Quantity) AS bags ' +
    'FROM OINV o ' +
    '  JOIN INV1 d ON d.DocEntry = o.DocEntry ' +
    '  JOIN OITM i ON i.ItemCode = d.ItemCode ' +
    '  LEFT JOIN OITG g ON g.ItmsGrpCod = i.ItmsGrpCod ' +
    'WHERE o.SlpCode = @slpCode ' +
    "  AND o.CANCELED = 'N' " +
    '  AND o.DocDate >= ' + _periodStartExpr(p) + ' ' +
    "GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(i.U_Brand)), ''), g.ItmsGrpNam, '(no brand)') " +
    'ORDER BY bags DESC'
  );
}

function byCustomerSql(period) {
  var p = normalizePeriod(period);
  return (
    'SELECT TOP 5 ' +
    '  o.CardCode, ' +
    '  c.CardName, ' +
    '  SUM(d.Quantity) AS bags ' +
    'FROM OINV o ' +
    '  JOIN INV1 d ON d.DocEntry = o.DocEntry ' +
    '  JOIN OCRD c ON c.CardCode = o.CardCode ' +
    'WHERE o.SlpCode = @slpCode ' +
    "  AND o.CANCELED = 'N' " +
    '  AND o.DocDate >= ' + _periodStartExpr(p) + ' ' +
    'GROUP BY o.CardCode, c.CardName ' +
    'ORDER BY bags DESC'
  );
}

function whitespaceSql() {
  // BPs in scope with zero CANCELED='N' invoices in current MTD window.
  return (
    'SELECT TOP 10 ' +
    '  c.CardCode, ' +
    '  c.CardName, ' +
    '  c.Phone1 ' +
    'FROM OCRD c ' +
    'WHERE c.SlpCode = @slpCode ' +
    "  AND c.validFor = 'Y' " +
    '  AND c.CardCode NOT IN (' +
    '    SELECT DISTINCT CardCode FROM OINV ' +
    '    WHERE SlpCode = @slpCode ' +
    "      AND CANCELED = 'N' " +
    '      AND DocDate >= ' + _periodStartExpr('MTD') +
    '  ) ' +
    'ORDER BY c.CardName'
  );
}

function atRiskSql() {
  // Single derived-table scan instead of 4 correlated subqueries.
  // For Windel's 25 BPs this drops from ~2s to <300ms on the SAP server.
  return (
    'SELECT TOP 10 ' +
    '  c.CardCode, ' +
    '  c.CardName, ' +
    '  li.last_date, ' +
    '  DATEDIFF(day, li.last_date, GETDATE()) AS days_since ' +
    'FROM OCRD c ' +
    'LEFT JOIN ( ' +
    '  SELECT CardCode, MAX(DocDate) AS last_date ' +
    '  FROM OINV ' +
    '  WHERE SlpCode = @slpCode ' +
    "    AND CANCELED = 'N' " +
    '  GROUP BY CardCode ' +
    ') li ON li.CardCode = c.CardCode ' +
    'WHERE c.SlpCode = @slpCode ' +
    "  AND c.validFor = 'Y' " +
    '  AND (li.last_date IS NULL OR DATEDIFF(day, li.last_date, GETDATE()) > 14) ' +
    'ORDER BY days_since DESC'
  );
}

function tierFromDaysSince(d) {
  if (d == null) return 'no_history';
  if (d > 30) return 'at_risk';
  if (d >= 15) return 'slowing';
  return 'healthy';
}

module.exports = {
  normalizePeriod,
  totalBagsSql,
  byBrandSql,
  byCustomerSql,
  whitespaceSql,
  atRiskSql,
  tierFromDaysSince
};
