// api/_lib/sap-proxy.js
//
// Consolidated SAP-read handlers. Each exported function is a full Vercel
// (req, res) handler, moved here verbatim from the former api/sap/<name>.js
// route files so the 7 SAP endpoints collapse into ONE serverless function
// (api/sap/[...path].js dispatches to these) — keeping Patrol under the
// Vercel function cap. Behaviour is unchanged: role gate -> callHqProxy ->
// stripMarginsIfNeeded -> wrapPatrolMeta. All SAP reads still go through the
// Cloud Run HQ proxy (never SAP B1 directly); every payload is margin-stripped.
//
// Living in api/_lib/ means Vercel does NOT count this as a function, and the
// existing unit tests load these handlers directly (mocking auth + hq-client).
const { requireRole } = require('./api-auth');
const { callHqProxy } = require('./hq-client');
const { stripMarginsIfNeeded, wrapPatrolMeta } = require('./scope');

const SAP_ROLES = ['dsm', 'rsm', 'exec', 'ceo', 'evp', 'admin'];

// GET /api/sap/ar
async function ar(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=30');

  let session;
  try {
    session = await requireRole(req, SAP_ROLES);
  } catch (err) {
    const status = (err && err.status) || 401;
    return res.status(status).json({ error: err.code || 'UNAUTHORIZED', message: err.message });
  }

  const params = {}; // HQ defaults to current AR snapshot

  try {
    const { status, body } = await callHqProxy('/api/ar', session, params);
    if (status >= 400) {
      return res.status(status === 504 ? 504 : 502).json({
        error: (body && body.error) || 'HQ upstream error',
        hq_status: status
      });
    }
    const wrapped = wrapPatrolMeta(stripMarginsIfNeeded(body, session), session, params);
    return res.status(200).json(wrapped);
  } catch (err) {
    console.error('[api/sap/ar] HQ call crashed:', (err && err.message) || err);
    return res.status(502).json({ error: 'HQ_UNREACHABLE', message: 'HQ proxy failed' });
  }
}

// GET /api/sap/customers?search=&region=&page=1&limit=50&sort=
async function customers(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=30');

  let session;
  try {
    session = await requireRole(req, SAP_ROLES);
  } catch (err) {
    const status = (err && err.status) || 401;
    return res.status(status).json({ error: err.code || 'UNAUTHORIZED', message: err.message });
  }

  const q = req.query || {};
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.max(1, Math.min(200, parseInt(q.limit, 10) || 50));
  const params = {
    search: q.search || undefined,
    region: q.region || undefined,
    page: page,
    limit: limit,
    sort: q.sort || undefined
  };

  try {
    const { status, body } = await callHqProxy('/api/customers', session, params);
    if (status >= 400) {
      return res.status(status === 504 ? 504 : 502).json({
        error: (body && body.error) || 'HQ upstream error',
        hq_status: status
      });
    }
    const wrapped = wrapPatrolMeta(stripMarginsIfNeeded(body, session), session, params);
    return res.status(200).json(wrapped);
  } catch (err) {
    console.error('[api/sap/customers] HQ call crashed:', (err && err.message) || err);
    return res.status(502).json({ error: 'HQ_UNREACHABLE', message: 'HQ proxy failed' });
  }
}

// GET /api/sap/customer/:cardcode  (cardcode read from req.query.cardcode)
async function customer(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=30');

  let session;
  try {
    session = await requireRole(req, SAP_ROLES);
  } catch (err) {
    const status = (err && err.status) || 401;
    return res.status(status).json({ error: err.code || 'UNAUTHORIZED', message: err.message });
  }

  const cardcode = req.query && req.query.cardcode;
  if (!cardcode || typeof cardcode !== 'string' || cardcode.length > 64) {
    return res.status(400).json({ error: 'BAD_CARDCODE' });
  }

  const params = { id: cardcode };

  try {
    const { status, body } = await callHqProxy('/api/customer', session, params);
    if (status === 403) return res.status(403).json(body || { error: 'OUT_OF_SCOPE' });
    if (status === 404) return res.status(404).json(body || { error: 'NOT_FOUND' });
    if (status >= 400) {
      return res.status(status === 504 ? 504 : 502).json({
        error: (body && body.error) || 'HQ upstream error',
        hq_status: status
      });
    }
    const wrapped = wrapPatrolMeta(stripMarginsIfNeeded(body, session), session, params);
    return res.status(200).json(wrapped);
  } catch (err) {
    console.error('[api/sap/customer] HQ call crashed:', (err && err.message) || err);
    return res.status(502).json({ error: 'HQ_UNREACHABLE', message: 'HQ proxy failed' });
  }
}

// GET /api/sap/inventory?plant=ALL
async function inventory(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=60');

  let session;
  try {
    session = await requireRole(req, SAP_ROLES);
  } catch (err) {
    const status = (err && err.status) || 401;
    return res.status(status).json({ error: err.code || 'UNAUTHORIZED', message: err.message });
  }

  const params = { plant: (req.query && req.query.plant) || 'ALL' };

  try {
    const { status, body } = await callHqProxy('/api/inventory', session, params);
    if (status >= 400) {
      return res.status(status === 504 ? 504 : 502).json({
        error: (body && body.error) || 'HQ upstream error',
        hq_status: status
      });
    }
    const wrapped = wrapPatrolMeta(stripMarginsIfNeeded(body, session), session, params);
    return res.status(200).json(wrapped);
  } catch (err) {
    console.error('[api/sap/inventory] HQ call crashed:', (err && err.message) || err);
    return res.status(502).json({ error: 'HQ_UNREACHABLE', message: 'HQ proxy failed' });
  }
}

// GET /api/sap/sales?period=MTD
async function sales(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=30');

  let session;
  try {
    session = await requireRole(req, SAP_ROLES);
  } catch (err) {
    const status = (err && err.status) || 401;
    return res.status(status).json({ error: err.code || 'UNAUTHORIZED', message: err.message });
  }

  const params = { period: (req.query && req.query.period) || 'MTD' };

  try {
    const { status, body } = await callHqProxy('/api/sales', session, params);
    if (status >= 400) {
      return res.status(status === 504 ? 504 : 502).json({
        error: (body && body.error) || 'HQ upstream error',
        hq_status: status
      });
    }
    const wrapped = wrapPatrolMeta(stripMarginsIfNeeded(body, session), session, params);
    return res.status(200).json(wrapped);
  } catch (err) {
    console.error('[api/sap/sales] HQ call crashed:', (err && err.message) || err);
    return res.status(502).json({ error: 'HQ_UNREACHABLE', message: 'HQ proxy failed' });
  }
}

// GET /api/sap/sales/all?period=MTD|YTD
async function salesAll(req, res) {
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
}

// GET /api/sap/speed?period=MTD
async function speed(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=30');

  let session;
  try {
    session = await requireRole(req, SAP_ROLES);
  } catch (err) {
    const status = (err && err.status) || 401;
    return res.status(status).json({ error: err.code || 'UNAUTHORIZED', message: err.message });
  }

  const params = { period: (req.query && req.query.period) || 'MTD' };

  try {
    const { status, body } = await callHqProxy('/api/speed', session, params);
    if (status >= 400) {
      return res.status(status === 504 ? 504 : 502).json({
        error: (body && body.error) || 'HQ upstream error',
        hq_status: status
      });
    }
    const wrapped = wrapPatrolMeta(stripMarginsIfNeeded(body, session), session, params);
    return res.status(200).json(wrapped);
  } catch (err) {
    console.error('[api/sap/speed] HQ call crashed:', (err && err.message) || err);
    return res.status(502).json({ error: 'HQ_UNREACHABLE', message: 'HQ proxy failed' });
  }
}

module.exports = { ar, customers, customer, inventory, sales, salesAll, speed };
