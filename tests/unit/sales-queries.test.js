// Unit tests for api/_lib/sales-queries.js — pure SQL builders.
const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../../api/_lib/sales-queries');

test('normalizePeriod defaults and clamps to MTD/YTD', () => {
  assert.equal(Q.normalizePeriod(undefined), 'MTD');
  assert.equal(Q.normalizePeriod(''), 'MTD');
  assert.equal(Q.normalizePeriod('mtd'), 'MTD');
  assert.equal(Q.normalizePeriod('ytd'), 'YTD');
  assert.equal(Q.normalizePeriod('last30'), 'MTD');
});

test('byCustomerSql is parameterized and uses MTD start by default', () => {
  const sql = Q.byCustomerSql('MTD');
  assert.match(sql, /^\s*SELECT TOP 5/i);
  assert.ok(sql.includes('@slpCode'), 'must use @slpCode parameter');
  assert.ok(!/--|;\s*DROP/i.test(sql), 'must not contain destructive tokens');
  assert.ok(/DATEFROMPARTS\(YEAR\(GETDATE\(\)\), MONTH\(GETDATE\(\)\), 1\)/.test(sql));
});

test('byCustomerSql YTD switches to year start', () => {
  const sql = Q.byCustomerSql('YTD');
  assert.ok(/DATEFROMPARTS\(YEAR\(GETDATE\(\)\), 1, 1\)/.test(sql));
});

test('whitespaceSql restricts to active BPs in scope', () => {
  const sql = Q.whitespaceSql();
  assert.match(sql, /^\s*SELECT TOP 10/i);
  assert.ok(sql.includes('@slpCode'));
  assert.ok(/c\.validFor = 'Y'/.test(sql));
  assert.ok(/NOT IN \(/.test(sql));
});

test('atRiskSql filters BPs with no orders or > 14 days', () => {
  const sql = Q.atRiskSql();
  assert.match(sql, /^\s*SELECT TOP 10/i);
  assert.ok(sql.includes('@slpCode'));
  assert.ok(/days_since DESC/i.test(sql));
  assert.ok(/> 14/.test(sql));
});

test('tierFromDaysSince', () => {
  assert.equal(Q.tierFromDaysSince(null), 'no_history');
  assert.equal(Q.tierFromDaysSince(5), 'healthy');
  assert.equal(Q.tierFromDaysSince(14), 'healthy');
  assert.equal(Q.tierFromDaysSince(15), 'slowing');
  assert.equal(Q.tierFromDaysSince(30), 'slowing');
  assert.equal(Q.tierFromDaysSince(31), 'at_risk');
  assert.equal(Q.tierFromDaysSince(120), 'at_risk');
});

test('totalBagsSql is parameterized and uses correct period', () => {
  const mtd = Q.totalBagsSql('MTD');
  assert.match(mtd, /^\s*SELECT/i);
  assert.ok(mtd.includes('@slpCode'));
  assert.ok(/SUM\(d\.Quantity\)/.test(mtd));
  assert.ok(/DATEFROMPARTS\(YEAR\(GETDATE\(\)\), MONTH\(GETDATE\(\)\), 1\)/.test(mtd));

  const ytd = Q.totalBagsSql('YTD');
  assert.ok(/DATEFROMPARTS\(YEAR\(GETDATE\(\)\), 1, 1\)/.test(ytd));
});

test('byBrandSql uses U_Brand with OITG fallback and is parameterized', () => {
  const sql = Q.byBrandSql('MTD');
  assert.match(sql, /^\s*SELECT TOP 5/i);
  assert.ok(sql.includes('@slpCode'));
  assert.ok(/i\.U_Brand/.test(sql), 'must read OITM.U_Brand');
  assert.ok(/g\.ItmsGrpNam/.test(sql), 'must fall back to OITG.ItmsGrpNam');
  assert.ok(/'\(no brand\)'/.test(sql), 'must have explicit fallback label');
  assert.ok(/ORDER BY bags DESC/i.test(sql));
});

test('atRiskSql now uses derived table (no correlated subqueries)', () => {
  const sql = Q.atRiskSql();
  // Old version had 4 inline `(SELECT MAX(DocDate) FROM OINV ...)` subqueries.
  // New version has exactly ONE such subquery inside the LEFT JOIN derived table.
  const matches = sql.match(/SELECT MAX\(DocDate\)/g) || [];
  assert.equal(
    matches.length,
    0,
    'atRiskSql should use derived table, not correlated MAX(DocDate) subqueries'
  );
  assert.ok(/LEFT JOIN \(/i.test(sql), 'must use a derived table (subquery in FROM)');
  assert.ok(/GROUP BY CardCode/.test(sql));
});

test('all SQL builders avoid destructive tokens', () => {
  const samples = [
    Q.totalBagsSql('MTD'),
    Q.byBrandSql('MTD'),
    Q.byCustomerSql('MTD'),
    Q.whitespaceSql(),
    Q.atRiskSql()
  ];
  for (const s of samples) {
    assert.ok(!/;\s*(DROP|DELETE|UPDATE|INSERT)\b/i.test(s));
    assert.ok(!/--/.test(s), 'no SQL line comments');
  }
});
