# VieForce Patrol — Master Test Plan (E2E Quality Gate, Step 3)

**Generated:** 2026-05-25
**Repo state:** post-W1.6 RLS scoping + 2026-05-24 polish waves; release `3.2.0-beta.2`
**Sources of truth:** `CLAUDE.md` §0 + §1 + §5, `PRODUCT.md`, `docs/AGENT_HANDOFF.md`, `app.html`, `api/**`, `tests/e2e/**`, `vercel.json`, `manifest.json`, `sw.js`
**Scope:** Master inventory of everything that must be verifiable on this pilot. Every item is checkable — by Playwright, manual smoke, or static code/header inspection. Not exhaustive; covers the major flows and pilot-risk surfaces.

Convention used:
- `[Wave 4]` — covered (or partly covered) by an existing `tests/e2e/*.spec.ts`
- `[NEW]` — no automated coverage today; needs manual or new spec
- `[MANUAL]` — verifiable but better done by human pilot tester
- `[STATIC]` — verifiable via file/header inspection (no runtime)

---

## A. SCREENS & NAVIGATION

Every `#page-*` section in `app.html` plus each standalone HTML shell. 19 pages enumerated from app.html.

| # | Item | Path / Selector | Coverage |
|---|------|------|---|
| A1 | `index.html` login shell renders (PIN form + Google button visible) | `/` or `/index.html` | [Wave 4] `01-auth.spec.ts` |
| A2 | `app.html` shell renders post-auth; default `#page-home` becomes `.active` | `app.html` L141 | [Wave 4] `08-navigation.spec.ts` |
| A3 | `#page-home` (default landing) shows correct chat-bg | `app.html` L141 | [Wave 4] `08-navigation` |
| A4 | `#page-dashboard` (Pulse density) renders for DSM/RSM | `app.html` L155 | [Wave 4] `05-dsm.spec.ts` |
| A5 | `#page-home-tsr` (TSR Messenger-hybrid home) renders for `tsr`/`champion` role | `app.html` L169 | [Wave 4] `08-navigation` |
| A6 | `#page-home-dsm` (DSM elite home) renders for `dsm` role | `app.html` L231 | [Wave 4] `05-dsm` |
| A7 | `#page-mapa-tsr` (TSR map tab) renders & loads MapLibre | `app.html` L294 | [Wave 4] `13-map-sync.spec.ts` |
| A8 | `#page-assign` (DSM → TSR assignment, stores + farms tabs) | `app.html` L314 | [Wave 4] `12-assign-team.spec.ts`, `14-assign-page.spec.ts` |
| A9 | `#page-stores` (Tindahan list, Messenger inbox style) | `app.html` L366 | [Wave 4] `02-stores.spec.ts` |
| A10 | `#page-map` (full map dark theme) renders | `app.html` L432 | [Wave 4] `13-map-sync` |
| A11 | `#page-visits` (visit history) renders + skeleton rows | `app.html` L478 | [Wave 4] `16-visits-tab.spec.ts` |
| A12 | `#page-profile` (TSR profile) renders + photo + edit affordances | `app.html` L529 | [Wave 4] `10-profile-phase4.spec.ts`, `06-more-sheet-profile.spec.ts` |
| A13 | `#page-notifs` renders without crashing on empty state | `app.html` L672 | [NEW] |
| A14 | `#page-leader` leaderboard shows top performers only (hiya rule, Rule 8) | `app.html` L695 | [NEW] manual + `phase4-social.js:1014-1092` unit cover |
| A15 | `#page-search` renders search input + 64px tap | `app.html` L727 | [NEW] |
| A16 | `#page-team` renders for DSM/RSM | `app.html` L742 | [Wave 4] `12-assign-team` |
| A17 | `#page-rsm-home` renders for RSM | `app.html` L761 | [Wave 4] `07-rsm.spec.ts` |
| A18 | `#page-tsr-scorecard` renders for self + retains selection | `app.html` L872 | [Wave 4] `06-more-sheet-profile` |
| A19 | `#page-store-detail` shows store data + competitor + product breakdown | `app.html` L887 | [NEW] |
| A20 | `#page-store-new` form renders + GPS auto-fill | `app.html` L922 | [Wave 4] `02-stores` |
| A21 | `#page-farm-new` form renders + GPS + farm type | `app.html` L944 | [Wave 4] `15-farms.spec.ts` |
| A22 | `admin.html` Sales Admin shell renders + user table | `admin.html` | [Wave 4] `17-admin-html.spec.ts` |
| A23 | `admin-org.html` org master renders + skeleton loader | `admin-org.html` | [Wave 4] `18-admin-org.spec.ts` |
| A24 | `admin-users-sap.html` SAP roster renders + mobile card view < 640px | `admin-users-sap.html` | [Wave 4] `11-admin-users-sap.spec.ts` |
| A25 | TSR bottom nav: exactly 4 tabs (Home / POS / Mapa / Higit pa) | `app.html` nav | [Wave 4] `08-navigation` |
| A26 | Manager nav switches role/device variant (`nav-role-device.js`) | `js/nav-role-device.js` | [Wave 4] `08-navigation` |
| A27 | "Higit pa" sheet exposes Profile, Visits, Logout | `app.html` more sheet | [Wave 4] `06-more-sheet-profile` |
| A28 | Page transition by class toggle does not orphan event listeners | n/a | [NEW] regression check |

---

## B. FEATURES & INTERACTIONS

| # | Item | Source | Coverage |
|---|------|--------|---|
| B1 | TSR PIN login → loads user, persists `auth.session` in localStorage | `js/auth.js`, `verify-pin` | [Wave 4] `01-auth` |
| B2 | Manager Google OAuth → JWT exchanged, `users.email` matched (case-insensitive) | `js/auth.js`, `21-oauth-flow.spec.ts` | [Wave 4] `21-oauth-flow` |
| B3 | Manager without `users.email` shows "No email — Google login blocked" | `admin.html` | [NEW] manual |
| B4 | Logout clears localStorage + redirects to `index.html` | `js/auth.js` | [Wave 4] `06-more-sheet-profile` |
| B5 | Store register: form validation + GPS + offline-first INSERT | `js/stores.js`, `js/offline.js` | [Wave 4] `02-stores`, `04-offline` |
| B6 | Farm register: form validation + GPS + offline-first INSERT | `js/farms.js`?/`api/farms.js` | [Wave 4] `15-farms` |
| B7 | Visit log: open store → record products/competitors/photo → save offline | `js/visit-wizard.js`, `js/visits.js` | [Wave 4] `03-visit`, `16-visits-tab` |
| B8 | Photo capture: compresses to ≤80KB (CLAUDE.md Rule 2) | `js/camera.js` | [Wave 4] `19-photo-budget.spec.ts` |
| B9 | Photo flow: INSERT visit → UPLOAD blob → PATCH photo_url (no orphan) | `js/camera.js`, `js/offline.js` | [Wave 4] `22-offline-drain` test 5 |
| B10 | DSM assignment: stores tab — assign store to TSR | `js/assign.js` | [Wave 4] `14-assign-page` |
| B11 | DSM assignment: farms tab — assign farm to TSR | `js/assign.js` | [Wave 4] `14-assign-page` |
| B12 | DSM leaderboard: top performers only (hiya rule) | `js/phase4-social.js:1014-1092` | [NEW] manual + unit |
| B13 | Offline queue: pending writes drain on reconnect | `js/offline.js` PatrolOffline v2 | [Wave 4] `04-offline`, `22-offline-drain` test 1 |
| B14 | Sync badge: never green while offline | `js/offline.js` | [Wave 4] `22-offline-drain` test 2 |
| B15 | Language switch (TL/CEB/EN) updates DOM via `data-i18n` | `js/i18n.js`, `js/lang-picker.js` | [Wave 4] `09-language.spec.ts` |
| B16 | Language persisted server-side via `api/user/language.js` | `api/user/language.js` | [Wave 4] `09-language` |
| B17 | Profile edit (name, photo, language) saves successfully | `js/profile-edit.js` ? | [Wave 4] `10-profile-phase4` |
| B18 | TSR scorecard retention after navigation away & back | `app.html` `#page-tsr-scorecard` | [Wave 4] `06-more-sheet-profile` |
| B19 | RSM home renders portfolio KPIs (lazy-loaded chart.js) | `js/rsm.js` | [Wave 4] `07-rsm` |
| B20 | DSM home renders skeleton-first then real data | `js/home-dsm.js` | [Wave 4] `05-dsm` |
| B21 | Map (Leaflet/MapLibre) plots stores + farms by GPS | `js/map.js` | [Wave 4] `13-map-sync` |
| B22 | Admin: create/edit user (name, phone, email, PIN, role, Region/District/Territory) | `admin.html`, `js/admin.js` | [Wave 4] `17-admin-html` |
| B23 | Admin: PIN reset endpoint succeeds (200 + new PIN) | `api/admin/users/reset-pin.js` | [NEW] |
| B24 | Admin Org: SAP Region/District sync into picklists | `admin-org.html`, `js/admin-org.js` | [Wave 4] `18-admin-org` |
| B25 | Admin SAP users: roster vs Patrol diff renders | `admin-users-sap.html`, `js/admin-users-sap.js` | [Wave 4] `11-admin-users-sap` |
| B26 | Service worker registers on load (unless `?nosw=1` or `localStorage.patrol_nosw=1`) | `app.html` L66, `index.html` L34 | [STATIC] + [NEW] |
| B27 | Add-to-Home-Screen prompt fires after 2nd visit | CLAUDE.md Rule 8 | [NEW] not yet built per backlog |
| B28 | Feature flags / release channel banner shown (`config.js` `RELEASE_CHANNEL`) | `js/feature-flags.js`, `js/release-channel.js` | [STATIC] |

---

## C. API ENDPOINTS

Every file under `api/` (Vercel serverless). 13 endpoint files + 9 lib modules.

| # | Item | Path | Coverage |
|---|------|------|---|
| C1 | `GET /api/health` returns 200 + service info | `api/health.js` | [NEW] |
| C2 | `GET /api/whoami` returns auth context (anon=null, valid session=user row) | `api/whoami.js` | [Wave 4] `01-auth` partial |
| C3 | `POST /api/farms` accepts farm INSERT with `x-session-id` or `Authorization: Bearer` | `api/farms.js` | [Wave 4] `15-farms` |
| C4 | `POST /api/admin/users/reset-pin` admin-only (403 otherwise) | `api/admin/users/reset-pin.js` | [NEW] |
| C5 | `GET /api/admin/org` returns Region/District tree (auth required) | `api/admin/org.js` | [Wave 4] `18-admin-org` partial |
| C6 | `GET /api/admin/sap-reps` returns SAP rep roster (auth required) | `api/admin/sap-reps.js` | [Wave 4] `11-admin-users-sap` |
| C7 | `POST /api/user/language` persists `users.locale` | `api/user/language.js` | [Wave 4] `09-language` |
| C8 | `GET /api/sap/customers` proxies to HQ (margin stripped) | `api/sap/customers.js` | [NEW] |
| C9 | `GET /api/sap/customer/[cardcode]` returns single customer | `api/sap/customer/[cardcode].js` | [NEW] |
| C10 | `GET /api/sap/inventory` proxies to HQ inventory | `api/sap/inventory.js` | [NEW] |
| C11 | `GET /api/sap/sales` returns sales (margin stripped per role) | `api/sap/sales.js` | [NEW] |
| C12 | `GET /api/sap/sales/all` returns full sales (admin only) | `api/sap/sales/all.js` | [NEW] |
| C13 | `GET /api/sap/ar` returns AR aging | `api/sap/ar.js` | [NEW] |
| C14 | `GET /api/sap/speed` benchmark endpoint responds | `api/sap/speed.js` | [NEW] |
| C15 | `api/_lib/auth.js` HYBRID accepts `x-session-id` OR `Authorization: Bearer` | `api/_lib/auth.js` | [STATIC] + [NEW] |
| C16 | `api/_lib/patrol-cors.js` rejects non-allow-listed origins | `api/_lib/patrol-cors.js` | [NEW] |
| C17 | `api/_lib/hq-client.js` strips margin fields before returning to non-priv roles | `api/_lib/hq-client.js` | [NEW] |
| C18 | `api/_lib/scope.js` role/scope guard rejects wrong-role access | `api/_lib/scope.js` | [NEW] |

---

## D. DATA INTEGRITY

| # | Item | Source | Coverage |
|---|------|--------|---|
| D1 | Offline INSERT (visit) → IndexedDB write happens before any server call | `js/offline.js` | [Wave 4] `04-offline`, `22-offline-drain` |
| D2 | Reconnect → drain order respected (oldest-first) | `js/offline.js` | [Wave 4] `22-offline-drain` test 1 |
| D3 | Quarantine on PGRST204; `requeueQuarantined` recovers | `js/offline.js` | [Wave 4] `22-offline-drain` test 3 |
| D4 | Page reload mid-queue: IndexedDB survives | n/a | [Wave 4] `22-offline-drain` test 4 |
| D5 | Photo flow: zero orphan blobs (INSERT first, then UPLOAD, then PATCH) | `js/camera.js`+queue | [Wave 4] `22-offline-drain` test 5 |
| D6 | Retry classification: `TypeError` x4 keeps record in queue, doesn't drop | `js/offline.js` | [Wave 4] `22-offline-drain` test 6 |
| D7 | `users_safe` VIEW excludes `pin_hash` (anon SELECT) | `supabase/migrations/...users_view*.sql` | [STATIC] migration grep |
| D8 | Base `users` table: anon SELECT revoked | same migration | [STATIC] |
| D9 | `sap_accounts` + `store_sap_matches` authenticated-only | `supabase/migrations/...w16_rls_scoping*.sql` | [STATIC] |
| D10 | `stores`/`visits`/`farms` anon-writable for queue replay (intentional W1.6) | same migration | [STATIC] |
| D11 | `offline_id` dedup: same visit submitted twice produces one row | `js/visits.js`, schema | [NEW] |
| D12 | CSV export does NOT leak `pin_hash` | `js/export.js` (R2 Track 1 commit `1cca873`) | [STATIC] grep |
| D13 | Concurrent assign of same store to two TSRs resolves deterministically | `js/assign.js` | [NEW] |
| D14 | Locale value round-trips (TL/CEB/EN) without corruption | `api/user/language.js` | [Wave 4] `09-language` |

---

## E. DESIGN & BRAND

| # | Item | Source | Coverage |
|---|------|--------|---|
| E1 | TSR screens use white bg + `#00A6CE` accent (NOT navy) | `css/tsr-field.css`, CLAUDE Rule 6 | [STATIC] grep + [MANUAL] |
| E2 | Manager/exec screens use Vienovo navy tokens | `css/tokens.css`, `css/dsm-rsm-mobile.css` | [STATIC] |
| E3 | All TSR-facing strings come from `T.*` / `data-i18n`, not hardcoded English | CLAUDE Rule 5, `js/i18n.js` | [Wave 4] `09-language`; [NEW] full sweep |
| E4 | Tagalog-first ordering (Tagalog / Bisaya / English fallback) | `locales/{tl,ceb,en}.json` | [STATIC] |
| E5 | TSR tap targets ≥ 64px (height) on all interactive elements | `css/tsr-field.css` | [Wave 4] `20-tsr-tap-targets.spec.ts` |
| E6 | Manager `.hdr-btn` ≥ 48px (W5 bump) | `css/dsm-rsm-mobile.css` | [Wave 4] `20-tsr-tap-targets` partial |
| E7 | Skeleton loaders (not spinners) on TSR + admin loading states | CLAUDE Rule 7 | [Wave 4] visits-tab, admin-org spec |
| E8 | UPPERCASE removed from Tindahan rows (polish 2026-05-24) | `css/tsr-field.css` | [STATIC] grep |
| E9 | `prefers-reduced-motion` honored across animated polish | CSS files | [STATIC] grep |
| E10 | Beta release-channel badge visible (manifest + UI match) | `config.js`, `manifest.json` | [STATIC] |
| E11 | Manager-only CSS (rsm.css, phase4-social.css, phase3-sales-stores.css, sales-tab-v2.css) NOT in TSR initial bundle | `app.html` L33-39 + `js/home-tsr.js` | [STATIC] |
| E12 | Visit-history rows display photo thumbnails (polish 2026-05-24) | `css/visits-page.css` | [Wave 4] `16-visits-tab` |
| E13 | No gradient typography on KPIs / callouts (DESIGN.md anti-pattern) | CSS sweep | [STATIC] |
| E14 | `theme-color` meta `#00A6CE` on app.html (PWA chrome match) | `app.html` L41 — note: file has `#004D71` | [STATIC] — FINDING: app.html sets `#004D71`, manifest sets `#00A6CE`. Mismatch worth verifying |

---

## F. PERFORMANCE

| # | Item | Target | Coverage |
|---|------|---|---|
| F1 | Photo ≤ 80KB after compression | CLAUDE Rule 2 (50KB target, 80KB ceiling) | [Wave 4] `19-photo-budget` |
| F2 | App shell cached ≤ 500KB | CLAUDE Rule 2 | [NEW] bundle size script |
| F3 | TSR cold-load: no manager CSS/JS in initial request | `app.html` lazy-load comment | [STATIC] |
| F4 | Service worker shell cache-first; API + Supabase + tiles never intercepted | `sw.js` L40-60 | [STATIC] + [NEW] |
| F5 | `chart.js` / `xlsx` / `maplibre-gl` lazy-loaded for manager routes only | `app.html` head, `ensureManager*Assets` | [STATIC] |
| F6 | Locale JSON loaded once per session, cached | `js/i18n.js` | [NEW] |
| F7 | Map tiles use OpenFreeMap/OpenStreetMap (no commercial quota risk) | CSP `connect-src` | [STATIC] vercel.json |
| F8 | No auto-polling that drains 2G data (CLAUDE Rule 2 anti-pattern) | code sweep | [NEW] |
| F9 | Photo upload retries don't double-bill data | `js/offline.js` queue dedup | [Wave 4] `22-offline-drain` |

---

## G. ERROR HANDLING

| # | Item | Coverage |
|---|------|---|
| G1 | App boots offline: shell renders cached, write paths still queue | [Wave 4] `04-offline` |
| G2 | API 500 on visit submit → record stays in queue, retried | [Wave 4] `22-offline-drain` test 6 |
| G3 | Session expired (JWT 401) → user redirected to login, draft preserved | [NEW] |
| G4 | Malformed server response → app does not crash; user-facing toast | [NEW] |
| G5 | Quota exceeded on Supabase Storage upload → photo stays queued | [NEW] |
| G6 | OAuth landing on `app.html?code=...` bounces to `index.html` (L46-57) | [Wave 4] `21-oauth-flow` partial |
| G7 | Boot debug panel `#patrol-boot-debug` opens on uncaught error (with `?bootlog=1`) | [STATIC] |
| G8 | GPS denied → form still submittable with manual lat/lng | [NEW] |
| G9 | Camera denied → visit save still possible without photo | [NEW] |
| G10 | Network timeout on `verify-pin` → PIN form returns user-readable error in TL | [NEW] |
| G11 | DSM with zero assigned territory → home shows empty-state, not crash | [NEW] |

---

## H. SECURITY

| # | Item | Source | Coverage |
|---|------|--------|---|
| H1 | RLS: `users_safe` VIEW excludes `pin_hash` | Migration `20260524151500_w16_rls_users_view` | [STATIC] |
| H2 | Anon SELECT on `users` base table REVOKED | Migration `...w16_rls_scoping_hardening` | [STATIC] |
| H3 | CORS allow-list (`api/_lib/patrol-cors.js`) blocks unknown origins | code | [NEW] |
| H4 | CSP set in `vercel.json` (no `unsafe-eval`, `frame-ancestors 'none'`) | `vercel.json` L13 | [STATIC] ✅ |
| H5 | HSTS preload: `max-age=63072000; includeSubDomains; preload` | `vercel.json` L10 | [STATIC] ✅ |
| H6 | `X-Frame-Options: DENY` | `vercel.json` L9 | [STATIC] ✅ |
| H7 | `X-Content-Type-Options: nosniff` | `vercel.json` L8 | [STATIC] ✅ |
| H8 | `Permissions-Policy` restricts geolocation+camera to self, blocks mic/payment | `vercel.json` L12 | [STATIC] ✅ |
| H9 | `Referrer-Policy: strict-origin-when-cross-origin` | `vercel.json` L11 | [STATIC] ✅ |
| H10 | Service role key never shipped to browser (`config.js` only has anon) | `config.js` | [STATIC] |
| H11 | `api/_lib/hq-client.js` strips margin/cost fields for non-priv roles | code | [NEW] |
| H12 | SAP token (`HQ_SERVICE_TOKEN`) only used server-side | code grep | [STATIC] |
| H13 | `verify-pin` Edge Function: rate-limit on PIN attempts | `supabase/functions/verify-pin/index.ts` | [NEW] manual |
| H14 | Admin endpoints (`api/admin/*`) return 401/403 to non-admin | code | [NEW] |
| H15 | OAuth domain lock `@vienovo.ph` enforced client+server | `js/auth.js`, Supabase OAuth config | [Wave 4] `21-oauth-flow` |

---

## I. ACCESSIBILITY

Defer detail to Round 8 agent. Spot checks only.

| # | Item | Coverage |
|---|------|---|
| I1 | TSR controls ≥ 64px (touch) | [Wave 4] `20-tsr-tap-targets` |
| I2 | No `user-scalable=no` in any in-scope shell | [STATIC] grep — confirmed in backlog "Closed" |
| I3 | Toasts use `role="status"` (per PRODUCT.md) | [STATIC] grep |
| I4 | Modals: focus trap + Escape to close (`js/admin.js`) | [NEW] |
| I5 | Visible focus outlines preserved (no `outline:none` strips) | [NEW] sweep |
| I6 | Reset-pin button WCAG contrast fix (polish 2026-05-24) | [STATIC] CSS check |
| I7 | Boot debug panel `aria-live="polite"` | [STATIC] app.html L78 ✅ |
| I8 | `data-i18n` strings have proper `lang` attribute where mixed | [NEW] |

---

## J. EDGE CASES

| # | Item | Coverage |
|---|------|---|
| J1 | Empty stores list → friendly empty-state with "Magdagdag" CTA | [NEW] |
| J2 | Empty visit history → skeleton then empty-state, no crash | [Wave 4] `16-visits-tab` |
| J3 | Very long store name (200+ chars) renders without overflow | [NEW] |
| J4 | Unicode/emoji in visit notes round-trips through IndexedDB + API | [NEW] |
| J5 | Concurrent edits of same visit (two devices) — last-write-wins semantics | [NEW] |
| J6 | Rapid tap on "Save Visit" button doesn't create duplicate (debounce) | [NEW] |
| J7 | Browser back/forward across `.page.active` toggling doesn't break state | [Wave 4] `08-navigation` partial |
| J8 | Locale switch mid-flow (TL→EN during visit save) doesn't lose form state | [NEW] |
| J9 | Phone screen rotation (portrait↔landscape) keeps state | [NEW] |
| J10 | Local time near midnight: "today's visit" rollover handled (PH timezone) | [NEW] |
| J11 | Storage quota exceeded (IndexedDB full) → user-visible warning | [NEW] |
| J12 | Service worker stale version: hard reload force-replaces | [STATIC] `sw.js` `skipWaiting()` + `clients.claim()` ✅ |
| J13 | Photo capture in low-light: compression still ≤80KB | [Wave 4] `19-photo-budget` partial |
| J14 | OAuth landing on `app.html?code=` correctly bounces to `index.html` | [STATIC] app.html L46-57 ✅ |
| J15 | TSR with role change to DSM mid-session: nav re-renders correctly on reload | [NEW] |

---

## SUMMARY

**Total items: 117**
- A. Screens & Navigation: 28
- B. Features & Interactions: 28
- C. API Endpoints: 18
- D. Data Integrity: 14
- E. Design & Brand: 14
- F. Performance: 9
- G. Error Handling: 11
- H. Security: 15
- I. Accessibility: 8
- J. Edge Cases: 15

**Wave 4 coverage:** ~62 items have at least partial Playwright coverage from `tests/e2e/01-22*.spec.ts`. The remaining ~55 items need manual smoke (pilot tester), static inspection, or new specs in subsequent rounds.

**Top 5 highest-value pilot risks (used in synthesis):**
1. **D5 / B9** Photo flow (INSERT first, no orphan blob) — silent data loss
2. **D7-D10** RLS posture (`users_safe`, anon writes intentional on stores/visits/farms) — security/correctness depends on these holding
3. **B13 / B14 / D2** Offline queue drain + sync badge truth — kills adoption if writes are lost or trust-marker lies
4. **F1 / F3** Photo ≤80KB + TSR cold-load < 500KB — PHP 15/100MB cost = adoption killer if broken
5. **B2 / G6 / H15** OAuth flow + email-match + domain lock — broken manager login blocks the entire DSM/RSM/CEO chain
