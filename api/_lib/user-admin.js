// Shared gate for Sales Admin API routes (ceo | admin | evp | marketing).

const USER_ADMIN_ROLES = new Set(['ceo', 'admin', 'evp', 'marketing']);

function assertUserAdmin(session) {
  if (!session) {
    return { ok: false, status: 401, body: { error: 'Unauthorized', message: 'Missing or invalid session' } };
  }
  const role = String(session.role || '').toLowerCase();
  if (!USER_ADMIN_ROLES.has(role)) {
    return {
      ok: false,
      status: 403,
      body: {
        error: 'Forbidden',
        message: 'User Admin access required (CEO, Sales Admin, EVP Sales, Marketing Manager)'
      }
    };
  }
  return { ok: true };
}

module.exports = { USER_ADMIN_ROLES, assertUserAdmin };
