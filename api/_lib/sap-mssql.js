// Direct SAP B1 MSSQL connection (Vercel serverless).
// SELECT-only. Read-only credentials assumed.
//
// Required env vars (set in Vercel):
//   SAP_DB_HOST     — analytics.vienovo.ph
//   SAP_DB_PORT     — 4444
//   SAP_DB_NAME     — Vienovo_Live
//   SAP_DB_USER     — read-only SQL login
//   SAP_DB_PASS     — password
// Optional:
//   SAP_DB_ENCRYPT  — '1' (default) for TLS, '0' to disable
//   SAP_DB_TRUST    — '1' (default) trust server cert, '0' to validate
//
// Pool is module-scoped so warm Lambdas reuse one connection.

let mssql;
try {
  mssql = require('mssql');
} catch (e) {
  // Surface a clearer error if the dep is missing in deploy.
  throw new Error('mssql package not installed — run "npm i mssql"');
}

let _poolPromise = null;

function _config() {
  const port = parseInt(process.env.SAP_DB_PORT || '1433', 10);
  return {
    server: process.env.SAP_DB_HOST,
    port: Number.isFinite(port) ? port : 1433,
    database: process.env.SAP_DB_NAME,
    user: process.env.SAP_DB_USER,
    password: process.env.SAP_DB_PASS,
    options: {
      encrypt: process.env.SAP_DB_ENCRYPT !== '0',
      trustServerCertificate: process.env.SAP_DB_TRUST !== '0',
      enableArithAbort: true
    },
    pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout: 12000,
    connectionTimeout: 8000
  };
}

function _assertEnv() {
  const required = ['SAP_DB_HOST', 'SAP_DB_NAME', 'SAP_DB_USER', 'SAP_DB_PASS'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error('SAP MSSQL env missing: ' + missing.join(', '));
  }
}

async function getPool() {
  if (_poolPromise) return _poolPromise;
  _assertEnv();
  _poolPromise = mssql.connect(_config()).catch((err) => {
    _poolPromise = null;
    throw err;
  });
  return _poolPromise;
}

/**
 * Run a parameterized SELECT.
 * @param {string} sqlText - must start with SELECT (case-insensitive)
 * @param {Array<{name:string,type:any,value:any}>} params - bound params
 */
async function querySelect(sqlText, params) {
  if (!/^\s*SELECT\b/i.test(sqlText)) {
    throw new Error('querySelect: only SELECT statements allowed');
  }
  const pool = await getPool();
  const req = pool.request();
  (params || []).forEach((p) => req.input(p.name, p.type, p.value));
  const result = await req.query(sqlText);
  return (result && result.recordset) || [];
}

module.exports = {
  getPool,
  querySelect,
  get sql() {
    return mssql;
  }
};
