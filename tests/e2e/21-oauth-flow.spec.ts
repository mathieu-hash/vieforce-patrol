import { test, expect, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import { isAppShellUrl, installAppInitScripts } from './_helpers';

/**
 * 21-oauth-flow.spec.ts — Wave 4 W4-OAuth (Audit E top-3, P1-1).
 *
 * Exercises the REAL Google OAuth path through `js/auth.js`
 * (`loginWithGoogle` + `maybeHandleGoogleLoginOnLoad`). The other
 * `loginAs*` helpers in `_helpers.ts` short-circuit OAuth by seeding
 * `patrol_session` straight into localStorage — that is fine for
 * non-auth tests, but it leaves the @vienovo.ph domain lock,
 * `users.email` match and role gate completely untested. This spec
 * closes that gap by:
 *   - stubbing `supabaseClient.auth` so we can inject a controlled
 *     OAuth session (no real Google round-trip),
 *   - route-mocking PostgREST `/rest/v1/users` so the manager-row
 *     lookup returns the fixture row (or null) for each case,
 *   - asserting both the post-Wave-1 AuthCore behavior (Bearer JWT
 *     in `supabase.auth.getSession()`, no `x-session-id`) AND the
 *     pre-Wave-1 UI contract (error copy from PRODUCT.md).
 *
 * Fixtures live in `tests/e2e/fixtures/oauth/`.
 */

interface OAuthFixture {
  description: string;
  supabaseSession: {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    expires_at: number;
    user: {
      id: string;
      aud: string;
      role: string;
      email: string;
      app_metadata: Record<string, unknown>;
      user_metadata: Record<string, unknown>;
      identities?: unknown[];
    };
  };
  patrolUserRow: Record<string, unknown> | null;
}

function loadFixture(name: string): OAuthFixture {
  const file = path.join(__dirname, 'fixtures', 'oauth', name);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as OAuthFixture;
}

const VALID_DSM = loadFixture('valid-dsm-token.json');
const WRONG_DOMAIN = loadFixture('wrong-domain-token.json');
const NO_EMAIL_MATCH = loadFixture('no-email-match-token.json');
const TSR_TRYING_MANAGER = loadFixture('tsr-trying-manager-route.json');

/**
 * Mock CORS so PostgREST 200 responses look like real cross-origin Supabase
 * calls (matches `_helpers.ts` mock-CORS pattern).
 */
function mockCorsHeaders(route: Route): Record<string, string> {
  const h = route.request().headers();
  const origin = h.origin || (h as { Origin?: string }).Origin || '*';
  const base: Record<string, string> = {
    'access-control-expose-headers': 'content-range',
    'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers':
      'authorization, content-type, apikey, prefer, accept-profile, range, x-client-info, accept',
  };
  if (origin === '*') {
    base['access-control-allow-origin'] = '*';
    return base;
  }
  base['access-control-allow-origin'] = origin;
  base['access-control-allow-credentials'] = 'true';
  return base;
}

/**
 * Patches `supabaseClient.auth` so the real `js/auth.js` code in
 * `maybeHandleGoogleLoginOnLoad` runs but with our controlled fixture.
 *
 * Strategy: route-intercept `/js/supabase.js` and replace it with a
 * functionally equivalent file that, after constructing the real
 * supabase-js client, overlays the auth methods we care about
 * (getSession, exchangeCodeForSession, setSession, signInWithOAuth,
 * signOut). This must run in the page's MAIN world to mutate the
 * client that other main-world scripts (notably js/auth.js) read.
 * Playwright `addInitScript` runs in an ISOLATED world and cannot
 * reliably reach into the supabase-js prototype chain.
 *
 * `__PATROL_E2E_OAUTH` on `window` carries the test config (session
 * to return + counters for signOut / signInWithOAuth). It is seeded
 * by an addInitScript so the patched supabase.js can read it.
 */
async function installOAuthSupabaseStub(page: Page, fixtureSession: Record<string, unknown>) {
  // Init script: seeds the OAuth-test config into window.__PATROL_E2E_OAUTH
  // so the route-rewritten js/supabase.js can read it. Counters reset per
  // page load (signOutCalls etc.), which is what we want.
  await page.addInitScript((injected) => {
    (window as unknown as { __PATROL_E2E_OAUTH: Record<string, unknown> }).__PATROL_E2E_OAUTH = {
      session: injected,
      providerEnabled: true,
      signOutCalls: 0,
      signInOAuthCalls: 0,
    };
  }, fixtureSession);

  // Network-level rewrite: intercept the local `js/supabase.js?v=...` file
  // and replace its body with an instrumented version that overlays auth
  // methods at construction time. This runs in the page's MAIN world, so
  // mutations to the returned client's `auth` object are guaranteed to be
  // visible to other main-world scripts (notably js/auth.js). An init
  // script in an isolated world cannot reliably mutate main-world objects
  // like `window.supabase.createClient`, which is why we replace the JS
  // source instead.
  const replacementJs = `// Patched by tests/e2e/21-oauth-flow.spec.ts — overlays supabase.auth methods.
(function () {
  var realClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      flowType: 'pkce',
      detectSessionInUrl: false
    }
  });

  function getCfg() {
    return window.__PATROL_E2E_OAUTH || {};
  }
  realClient.auth.__patrolE2ePatched = true;
  realClient.auth.getSession = async function () {
    var cfg = getCfg();
    if (cfg && cfg.session) return { data: { session: cfg.session }, error: null };
    return { data: { session: null }, error: null };
  };
  realClient.auth.exchangeCodeForSession = async function () {
    var cfg = getCfg();
    if (cfg && cfg.session) return { data: { session: cfg.session, user: cfg.session.user }, error: null };
    return { data: { session: null, user: null }, error: { message: 'E2E: no fixture session installed' } };
  };
  realClient.auth.setSession = async function () {
    var cfg = getCfg();
    if (cfg && cfg.session) return { data: { session: cfg.session, user: cfg.session.user }, error: null };
    return { data: { session: null, user: null }, error: { message: 'E2E: no fixture session for setSession' } };
  };
  realClient.auth.signInWithOAuth = async function () {
    var cfg = getCfg();
    cfg.signInOAuthCalls = (cfg.signInOAuthCalls || 0) + 1;
    return { data: { provider: 'google', url: '#mock-oauth-no-redirect' }, error: null };
  };
  realClient.auth.signOut = async function () {
    var cfg = getCfg();
    cfg.signOutCalls = (cfg.signOutCalls || 0) + 1;
    cfg.session = null;
    return { error: null };
  };

  window.supabaseClient = realClient;
})();
`;
  await page.route('**/js/supabase.js**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: replacementJs,
    });
  });
}

/**
 * PostgREST route mock — `/rest/v1/users?email=eq.<x>&is_active=eq.true&select=...`
 * returns the configured patrol row (or an empty array if `null`). Also covers
 * the auth-settings endpoint that `isGoogleProviderEnabled()` calls.
 */
async function installOAuthSupabaseRoutes(page: Page, patrolRow: Record<string, unknown> | null) {
  // Auth settings probe (used by isGoogleProviderEnabled).
  await page.route('**/auth/v1/settings**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        external: { google: true },
        disable_signup: false,
      }),
    });
  });

  // Other /auth/v1 endpoints (logout, etc.) — return empty 200.
  await page.route('**/auth/v1/**', async (route) => {
    if (/\/auth\/v1\/settings/.test(route.request().url())) {
      return route.fallback();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: mockCorsHeaders(route),
      body: '{}',
    });
  });

  // PostgREST: manager row lookup by email.
  await page.route('**/rest/v1/users*', async (route) => {
    const method = route.request().method();
    if (method !== 'GET' && method !== 'HEAD') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: mockCorsHeaders(route),
        body: '{}',
      });
    }
    const body = patrolRow ? [patrolRow] : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: mockCorsHeaders(route),
      body: JSON.stringify(body),
    });
  });
}

test.describe('21 — Real OAuth flow (W4-OAuth, Audit E top-3)', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any stale patrol_session — but ONLY on the first navigation. Init
    // scripts run on every navigation, so an unconditional removeItem would
    // wipe the patrol_session that the OAuth flow writes just before
    // redirecting to /app.html, causing app.html → requireAuth → bounce-back
    // to index.html, defeating the happy-path test.
    await page.addInitScript(() => {
      try {
        if (!sessionStorage.getItem('__patrolE2eInitPass')) {
          localStorage.removeItem('patrol_session');
          sessionStorage.setItem('__patrolE2eInitPass', '1');
        }
      } catch (_e) {
        /* ignore */
      }
    });
  });

  test('a) Happy path: valid @vienovo.ph DSM with matching users.email lands on manager home', async ({ page }) => {
    await installOAuthSupabaseStub(page, VALID_DSM.supabaseSession as unknown as Record<string, unknown>);
    // Stub app-shell APIs so the post-login redirect to app.html does not hit live network.
    // Playwright route handlers are LIFO — register OAuth routes AFTER installAppInitScripts so
    // our /rest/v1/users* + /auth/v1/settings handlers take precedence.
    await installAppInitScripts(page);
    await installOAuthSupabaseRoutes(page, VALID_DSM.patrolUserRow);

    // Single navigation with PKCE code so maybeHandleGoogleLoginOnLoad takes the exchange branch.
    await Promise.all([
      page.waitForURL(isAppShellUrl, { timeout: 25000 }),
      page.goto('/?code=e2e-pkce-code'),
    ]);

    // DSM lands on #page-home-dsm per role-scope.homePageId().
    await expect(page.locator('#page-home-dsm.active')).toBeVisible({ timeout: 25000 });

    // Patrol session row written from the matched manager users.row.
    const stored = await page.evaluate(() => localStorage.getItem('patrol_session'));
    expect(stored, 'patrol_session must be populated after successful Google login').not.toBeNull();
    const parsed = JSON.parse(stored as string);
    expect(parsed.role).toBe('dsm');
    expect(parsed.email).toBe(VALID_DSM.patrolUserRow!.email);
    expect(parsed.auth_source).toBe('google');

    // W1-AuthCore: supabase.auth.getSession() returns the bearer JWT.
    const authToken = await page.evaluate(async () => {
      const client = (window as unknown as { supabaseClient?: { auth?: { getSession: () => Promise<unknown> } } }).supabaseClient;
      if (!client || !client.auth) return null;
      const r = (await client.auth.getSession()) as { data?: { session?: { access_token?: string } } };
      return r?.data?.session?.access_token || null;
    });
    expect(authToken).toBe(VALID_DSM.supabaseSession.access_token);

    // W1-AuthCore: any patrol-API helper sends Authorization: Bearer <jwt>, NOT x-session-id.
    const headerCheck = await page.evaluate(async () => {
      type AuthHeadersFn = () => Promise<Record<string, string>>;
      const fn = (window as unknown as { authHeaders?: AuthHeadersFn }).authHeaders;
      if (typeof fn !== 'function') return { hasFn: false };
      const headers = await fn();
      return {
        hasFn: true,
        authorization: headers.Authorization || headers.authorization || null,
        sessionIdHeader: headers['x-session-id'] || (headers as Record<string, string>)['X-Session-Id'] || null,
      };
    });
    expect(headerCheck.hasFn).toBe(true);
    expect(headerCheck.authorization).toBe('Bearer ' + VALID_DSM.supabaseSession.access_token);
    expect(headerCheck.sessionIdHeader).toBeNull();
  });

  test('b) Domain lock: @gmail.com address is rejected before users-table lookup', async ({ page }) => {
    await installOAuthSupabaseStub(page, WRONG_DOMAIN.supabaseSession as unknown as Record<string, unknown>);

    let userLookupHit = false;
    // Capture whether the manager-row query was issued — domain lock must short-circuit BEFORE that.
    await installOAuthSupabaseRoutes(page, null);
    await page.route('**/rest/v1/users*', async (route) => {
      userLookupHit = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: mockCorsHeaders(route),
        body: '[]',
      });
    });

    await page.goto('/?code=e2e-pkce-code-gmail');

    const errorBox = page.locator('#login-error');
    await expect(errorBox).toBeVisible({ timeout: 20000 });
    await expect(errorBox).toContainText(/@vienovo\.ph/i);

    // Must NOT have written a patrol session.
    const stored = await page.evaluate(() => localStorage.getItem('patrol_session'));
    expect(stored).toBeNull();

    // Must NOT have queried users by email — domain lock fires first.
    expect(userLookupHit).toBe(false);

    // Stayed on the login shell (path is `/` or `/index.html` — `serve` rewrites
    // index.html → /; either is acceptable as long as we did not bounce to /app).
    const pathOnFail = new URL(page.url()).pathname;
    expect(pathOnFail === '/' || pathOnFail.endsWith('/index.html')).toBe(true);

    // signOut() was invoked to clear the bad Google session.
    const signOutCalls = await page.evaluate(() =>
      ((window as unknown as { __PATROL_E2E_OAUTH: { signOutCalls: number } }).__PATROL_E2E_OAUTH || {}).signOutCalls,
    );
    expect(signOutCalls).toBeGreaterThanOrEqual(1);
  });

  test('c) No email match: valid @vienovo.ph Google user with no users.email row shows blocked-UI', async ({ page }) => {
    await installOAuthSupabaseStub(page, NO_EMAIL_MATCH.supabaseSession as unknown as Record<string, unknown>);
    // users.email lookup returns empty → maybeHandleGoogleLoginOnLoad falls into the "manager not found" branch.
    await installOAuthSupabaseRoutes(page, NO_EMAIL_MATCH.patrolUserRow);

    await page.goto('/?code=e2e-pkce-code-noemail');

    const errorBox = page.locator('#login-error');
    await expect(errorBox).toBeVisible({ timeout: 20000 });
    // Per PRODUCT.md: "Google account not found in Patrol managers." — copy in js/auth.js:525.
    await expect(errorBox).toContainText(/not found in Patrol managers/i);

    const stored = await page.evaluate(() => localStorage.getItem('patrol_session'));
    expect(stored).toBeNull();

    // Stays on the login shell (path `/` or `/index.html` — `serve` rewrites
    // index.html → /; either is acceptable as long as we did not bounce to /app).
    const pathC = new URL(page.url()).pathname;
    expect(pathC === '/' || pathC.endsWith('/index.html')).toBe(true);

    const signOutCalls = await page.evaluate(() =>
      ((window as unknown as { __PATROL_E2E_OAUTH: { signOutCalls: number } }).__PATROL_E2E_OAUTH || {}).signOutCalls,
    );
    expect(signOutCalls).toBeGreaterThanOrEqual(1);
  });

  test('d) Role bypass attempt: users.role=tsr is rejected from manager Google flow', async ({ page }) => {
    await installOAuthSupabaseStub(page, TSR_TRYING_MANAGER.supabaseSession as unknown as Record<string, unknown>);
    // users-by-email returns a row, but role=tsr → isManagerRole() returns false.
    await installOAuthSupabaseRoutes(page, TSR_TRYING_MANAGER.patrolUserRow);

    await page.goto('/?code=e2e-pkce-code-tsr');

    const errorBox = page.locator('#login-error');
    await expect(errorBox).toBeVisible({ timeout: 20000 });
    // Copy per js/auth.js:534 — "This Google login is for managers only. TSR must sign in with phone + PIN."
    await expect(errorBox).toContainText(/managers only/i);

    // No patrol session was written — role gate must short-circuit BEFORE createSessionFromUser.
    const stored = await page.evaluate(() => localStorage.getItem('patrol_session'));
    expect(stored).toBeNull();

    // Stays on the login shell — TSR did not sneak onto an app.html manager surface.
    const pathD = new URL(page.url()).pathname;
    expect(pathD === '/' || pathD.endsWith('/index.html')).toBe(true);

    // Google session was revoked (signOut called) so the TSR cannot replay the JWT.
    const signOutCalls = await page.evaluate(() =>
      ((window as unknown as { __PATROL_E2E_OAUTH: { signOutCalls: number } }).__PATROL_E2E_OAUTH || {}).signOutCalls,
    );
    expect(signOutCalls).toBeGreaterThanOrEqual(1);
  });
});
