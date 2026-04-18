// GET /api/sap/customer/:cardcode
// Single customer detail. Vercel resolves [cardcode] from the URL into req.query.cardcode.
// RBAC: a TSR/DSM/RSM only gets the response if the customer falls in their scope.
const { verifySession, unauthorized } = require('../../_lib/auth');
const { callHqApiCached } = require('../../_lib/hq-client');
const { isElevated, stripMargins } = require('../../_lib/scope');

module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, max-age=30');

  const session = await verifySession(req);
  if (!session) return unauthorized(res);

  const cardcode = req.query && req.query.cardcode;
  if (!cardcode || typeof cardcode !== 'string' || cardcode.length > 64) {
    return res.status(400).json({ error: 'BAD_CARDCODE' });
  }

  const data = await callHqApiCached('/api/customer', session.id, { id: cardcode });
  if (data && data.error) return res.status(502).json(data);

  // RBAC for non-elevated roles — does the customer's district/region match the user?
  if (!isElevated(session.role)) {
    const role = String(session.role || '').toLowerCase();
    const cust = data && (data.customer || data);
    const custDistrict = String(cust && (cust.district || cust.Territory || cust.territory) || '').toUpperCase();
    const custRegion = String(cust && (cust.region || cust.Region) || '').toUpperCase();

    let allowed = true;
    if (role === 'dsm' && session.district) {
      const my = session.district.toUpperCase();
      allowed = !!custDistrict && (custDistrict.indexOf(my) !== -1 || my.indexOf(custDistrict) !== -1);
    } else if (role === 'rsm' && session.region) {
      allowed = custRegion === session.region.toUpperCase();
    }
    if (!allowed) return res.status(403).json({ error: 'OUT_OF_SCOPE' });

    stripMargins(data);
  }

  res.status(200).json(data);
};
