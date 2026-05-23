/**
 * Wave 1 (W1-ApiGates) — auth contract shim.
 *
 * W1-AuthCore is authoring `requireUser` / `requireRole` / `withAuth`
 * directly inside `api/_lib/auth.js` in a parallel worktree. This shim
 * gives every Patrol API handler the SAME public contract so this
 * worktree's endpoints can be written and tested today, before that
 * change lands. At integration time the integrator can either:
 *
 *   (a) keep this shim (it just delegates to verifySession), OR
 *   (b) flip every `require('./_lib/api-auth')` to `require('./_lib/auth')`.
 *
 * Either way, endpoint code does NOT change.
 *
 * Contract:
 *   requireUser(req)                  -> session object OR throws { status, message }
 *   requireRole(req, allowedRoles)    -> session object OR throws { status, message }
 *   withAuth(handler, { roles })      -> wraps a Vercel handler with auth + role gate
 *
 * `throw { status, message }` (not Error) keeps payloads JSON-clean and lets
 * the `withAuth` wrapper write `res.status(status).json({ error, message })`
 * without leaking stack traces.
 */

const { verifySession } = require('./auth');

class AuthError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || (status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN');
  }
}

/**
 * Verify session header and return the user record. Throws AuthError(401)
 * on missing / invalid / inactive session.
 */
async function requireUser(req) {
  const user = await verifySession(req);
  if (!user) {
    throw new AuthError(401, 'Missing or invalid session', 'UNAUTHORIZED');
  }
  return user;
}

/**
 * Verify session + role allowlist. Throws AuthError(401) if no session,
 * AuthError(403) if the role isn't in `allowedRoles`.
 *
 * @param {object}   req
 * @param {string[]} allowedRoles e.g. ['admin','ceo','evp','marketing']
 */
async function requireRole(req, allowedRoles) {
  const user = await requireUser(req);
  const role = String(user.role || '').toLowerCase();
  const allowed = (allowedRoles || []).map(function (r) {
    return String(r || '').toLowerCase();
  });
  if (allowed.length && allowed.indexOf(role) === -1) {
    throw new AuthError(403, 'Role "' + role + '" is not permitted for this endpoint', 'FORBIDDEN');
  }
  return user;
}

/**
 * Wrap a Vercel handler with auth enforcement. The wrapped handler receives
 * the validated `user` as a 3rd argument so it doesn't need to call
 * `requireUser` again. Errors thrown by the wrapped handler are caught and
 * turned into structured JSON 5xx responses (never raw stacks).
 *
 * @param {(req, res, user) => Promise<any>} handler
 * @param {{ roles?: string[] }} [opts]
 */
function withAuth(handler, opts) {
  opts = opts || {};
  const roles = Array.isArray(opts.roles) ? opts.roles : null;
  return async function wrapped(req, res) {
    let user;
    try {
      user = roles ? await requireRole(req, roles) : await requireUser(req);
    } catch (err) {
      const status = (err && err.status) || 500;
      const code = (err && err.code) || (status === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED');
      const message = (err && err.message) || 'Unauthorized';
      if (!res.getHeader || !res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json');
      }
      return res.status(status).json({ error: code, message: message });
    }
    try {
      return await handler(req, res, user);
    } catch (err) {
      // Auth error thrown deeper inside the handler (e.g. a nested requireRole).
      if (err && err.status && err.code) {
        if (!res.getHeader || !res.getHeader('Content-Type')) {
          res.setHeader('Content-Type', 'application/json');
        }
        return res.status(err.status).json({ error: err.code, message: err.message });
      }
      console.error('[api-auth] handler crashed:', (err && err.stack) || err);
      if (!res.getHeader || !res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json');
      }
      return res.status(500).json({ error: 'INTERNAL', message: 'Unhandled server error' });
    }
  };
}

module.exports = { requireUser, requireRole, withAuth, AuthError };
