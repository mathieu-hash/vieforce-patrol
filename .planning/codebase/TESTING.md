# Testing Patterns

**Analysis Date:** 2026-05-04

## Test Framework

**Runner:**
- **Unit:** Node.js built-in **`node:test`** with **`node:assert/strict`** — no Jest/Vitest dependency (`package.json` has no test runner devDependency beyond Playwright).
- Config: **Not applicable** — tests invoked via explicit file list in `npm run test:unit` (see below).

**Assertion Library:**
- `require('node:assert/strict')` (`tests/unit/hq-client.test.js`, `tests/unit/scope.test.js`, etc.).

**Run Commands:**
```bash
npm run test:unit    # Locale parity + all unit files (explicit list in package.json)
npm run check:locales  # Only scripts/check-locale-parity.mjs (also runs as first step of test:unit)
npm test             # alias: playwright test (E2E)
npm run test:e2e     # same as npm test
npm run test:e2e:report   # playwright test --reporter=html
```

**Node version:** Comments in unit tests reference **Node 22+** for `node:test` (`hq-client.test.js`, `scope.test.js`). Use a matching Node when running `test:unit`.

## Test File Organization

**Location:**
- **Unit:** `tests/unit/*.test.js` — flat directory, one concern per file.
- **E2E:** `tests/e2e/*.spec.ts` — Playwright, numbered prefixes (`01-auth`, `02-stores`, …).

**Naming:**
- Unit: `*.test.js` (e.g. `sap-sales.test.js`, `role-scope.test.js`).
- E2E: `NN-topic.spec.ts`.

**Structure:**
```
tests/
├── unit/
│   ├── _helpers.js          # require.cache mock harness for api/sap/* tests
│   ├── hq-client.test.js
│   ├── scope.test.js
│   ├── role-scope.test.js
│   ├── offline-queue-payload.test.js
│   ├── patrol-duplicate-error.test.js
│   ├── stores-nav-pref.test.js
│   ├── sales-tab-format.test.js
│   ├── sales-queries.test.js
│   ├── sap-sales.test.js
│   ├── sap-sales-all.test.js
│   ├── sap-ar.test.js
│   ├── sap-customers.test.js
│   ├── sap-customer.test.js
│   ├── sap-inventory.test.js
│   └── sap-speed.test.js
└── e2e/
    ├── 01-auth.spec.ts
    ├── 02-stores.spec.ts
    ├── 03-visit.spec.ts
    ├── 04-offline.spec.ts
    └── 05-dsm.spec.ts
```

## Test Structure

**Suite Organization:**
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

test('description', async () => {
  // ...
});
```

**Patterns:**
- **`try` / `finally`** around `global.fetch` mocks to restore original (`hq-client.test.js`).
- **`process.env`** pinned in tests for deterministic URLs/tokens before invoking `callHqProxy`.
- **SAP route tests:** `tests/unit/_helpers.js` installs mocked `require.cache` entries for `api/_lib/auth.js` and `api/_lib/hq-client.js`, then `loadEndpoint` clears cache and `require`s the route handler — no external mocking library.

## Mocking

**Framework:** None — manual **`require.cache`** substitution (`_helpers.js`) and **`mockFetch`** / restore for `hq-client` tests.

**Patterns:**
```javascript
// _helpers: installMocks() then loadEndpoint('../../api/sap/sales.js')
// hq-client: mockFetch(handler); try { ... } finally { restoreFetch(); }
```

**What to Mock:**
- **`fetch`** when testing `api/_lib/hq-client.js`.
- **Auth + HQ proxy** when testing `api/sap/*` handlers via `_helpers.js`.

**What NOT to Mock:**
- Prefer real `require` of pure libs like `api/_lib/scope.js` in `scope.test.js` (no cache hacks).

## Fixtures and Factories

**Test data:**
- Inline constants (`DSM`, `EXEC` session objects) in `sap-sales.test.js`.
- **`patrol-duplicate-error.test.js`** reads `js/db.js` from disk and **`vm.runInThisContext`** on extracted function source — special-case for testing a function not exported from the module.

**Location:**
- No central `fixtures/` folder — data co-located in test files.

## Coverage

**Requirements:** None enforced — no `c8`/`nyc` scripts in `package.json`.

**View Coverage:**
- Not configured.

## Test Types

**Unit Tests:**
- **`api/_lib/hq-client.js`:** HTTP behavior, retries, timeout → 504, 4xx no retry (`hq-client.test.js`).
- **`api/_lib/scope.js`:** margin stripping, `wrapPatrolMeta`, meta envelope (`scope.test.js`).
- **`api/sap/*` routes:** JSON shape, status codes 502/504, query defaults, role-specific stripping — each `sap-*.test.js` pairs with an endpoint under `api/sap/` using `_helpers.js`.
- **`api/_lib/sales-queries.js`:** `sales-queries.test.js`.
- **Role / scope / stores / offline:** `role-scope.test.js`, `scope.test.js`, `stores-nav-pref.test.js`, `offline-queue-payload.test.js`.
- **Client helpers:** `sales-tab-format.test.js`, `patrol-duplicate-error.test.js` (Supabase duplicate detection helper in `js/db.js`).

**Integration Tests:**
- Not separate — SAP unit tests call handler functions with mocked upstream.

**E2E Tests:**
- **Playwright** `@playwright/test` `^1.59.1` — config in `playwright.config.ts`.
- **`testDir`:** `./tests/e2e`.
- **`use.baseURL`:** `https://vieforce-patrol.vercel.app` — tests run against **production** unless overridden via CLI/env.
- **Projects:** Chromium only; **retries:** 2; **timeout:** 30s per test.
- Helpers: e.g. `injectSession` via `localStorage` in `01-auth.spec.ts`.

## Playwright Configuration

**Key file:** `playwright.config.ts`
- Reporters: list + html (`open: 'never'`).
- Screenshots/traces: on failure only.

**Running E2E locally:**
```bash
npx playwright test
# or
npm test
```
Override base URL when needed:
```bash
npx playwright test --config=playwright.config.ts
# Set PLAYWRIGHT_TEST_BASE_URL if you introduce env-based baseURL (not in current config — may require editing config or using CLI --base-url when supported)
```
*(Current config hardcodes `baseURL` in `use`; for local/staging runs, temporarily change `playwright.config.ts` or use Playwright’s documented override mechanisms.)*

## CI-Shaped Checks (No GitHub Actions in Repo)

**Observed:** No `.github/workflows/*.yml` in repository — **CI is not defined in-repo.**

**Recommended local “CI-shaped” sequence before merge:**
```bash
npm run check:locales    # or rely on test:unit prefix
npm run test:unit        # locale parity + node:test suite
npm run check:supabase-auth   # optional env validation script when touching auth
npm test                 # Playwright E2E against configured baseURL (production by default)
```

**Additional scripts (not tests but quality gates):**
- `npm run check:locales` — fails if locale keys diverge.
- `npm run check:supabase-auth` — `scripts/check-supabase-auth-config.mjs` (config validation).

## Common Patterns

**Async Testing:**
```javascript
test('returns 200', async () => {
  await handler(H.mockReq(), H.mockRes());
  assert.equal(res.statusCode, 200);
});
```

**Error Testing:**
```javascript
test('returns 502 on HQ 500', async () => {
  H.setProxyResult({ status: 500, body: { error: 'boom' } });
  await handler(req, res);
  assert.equal(res.statusCode, 502);
});
```

---

*Testing analysis: 2026-05-04*
