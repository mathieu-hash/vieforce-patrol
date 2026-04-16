// Vercel Serverless Function — GET /api/health
module.exports = function(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');
  res.status(200).json({
    status: 'ok',
    version: '3.0',
    domain: 'patrol.vienovo.ph',
    timestamp: new Date().toISOString()
  });
};
