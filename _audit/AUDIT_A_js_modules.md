# Audit A — JS Modules

## Summary

- **Scope:** all of `js/` except `js/offline.js` (Agent D). 41 files / ~684 KB total. Read-only.
- **Findings:** P0=6, P1=14, P2=15, P3=8 — total 43.
- **Top 3 risks:**
  1. **PINs are stored & exported in plaintext** — `js/admin.js` writes the raw user input into `users.pin_hash`, displays it in the admin table, and the CSV export contains plaintext PINs. Pilot-blocking security issue.
  2. **TSR sync pill lies when offline** — `js/home-tsr.js` and `js/stores.js` show `sync.syncing` / "Syncing…" when `navigator.onLine === false`. Breaks CLAUDE.md Rule 7 ("sync status truth") for TSR screens.
  3. **DSM "home" is mostly fake mock data** — `js/home-dsm.js` derives KPIs/coaching/squad-feed from `getMyTsrsWithActivity` (random seed numbers), `getStoresVisitedThisMonth()=47`, `getMyTeamStoreCount()` heuristic, mock `PATROL_MOCK_FEED_POSTS`. A DSM piloting the app will see numbers unrelated to reality.

---

## Findings

### [P0] PIN stored & exported in plaintext — js/admin.js:548, 707, 749, 819-823
What's wrong:
- `submitAddUser` (`pin_hash: pin`) writes the literal PIN string to `users.pin_hash`.
- `submitEditUser` (`payload.pin_hash = newPin`) and `resetUserPIN` (`pin_hash: newPin`) repeat the pattern.
- `getPinDisplayUser` (lines 152-156) and `_formatCurrentPinField` echo plaintext digits back to the admin UI with the title attribute "Plaintext in DB (admin only) — avoid in production if possible" — author acknowledged the risk.
- `exportUsersCSV` (lines 814-832) writes a CSV with a literal `'PIN (plain if stored)'` column containing 4-6 digit PINs in the clear.
- DB column is named `pin_hash` but contains raw secret; auth flow (`verify-pin` Edge Function) is comparing against this. Anyone with admin access (or who intercepts the CSV) has every TSR's working credential.

Recommended fix: hash PINs server-side (bcrypt / argon2 via the verify-pin edge function or a new `admin-set-pin` function), stop displaying the value, and remove the column from CSV export. Until then, treat the admin-only page as a hard-secured surface and block CSV export of the PIN column.
Effort: L

### [P0] TSR sync pill shows "Syncing…" while offline — js/home-tsr.js:466-468, js/stores.js:610-612
What's wrong:
```js
// home-tsr.js
syncEl.textContent = synced ? _t('sync.synced') : _t('sync.syncing');
// stores.js (Tindahan header)
pill.textContent = synced ? t('tindahan.sync_synced') : t('tindahan.sync_syncing');
```
`synced` here is `navigator.onLine`. When `false`, both UIs claim Patrol is currently syncing, which contradicts the real `js/visits.js#enhancedSyncStatus()` bar and violates CLAUDE.md Rule 7 (TSR sync status must be truthful) and §16 mapping ("orange offline" not blue syncing).
Recommended fix: when offline, show the `T.offline` / "Offline" label (and use the correct CSS class) and gate "Syncing…" on the real `_syncInProgress` flag from `enhancedSyncStatus`.
Effort: S

### [P0] DSM home is rendered from random mock data — js/home-dsm.js:37-72, 230-244
What's wrong:
- `getMyTsrsWithActivity` walks direct reports but synthesises `visits_week`, `visits_month`, `score`, `active_pct` etc. from `seed = charCodeSum(id) % 11`. The "TSR Performance" table, coaching moments, attention strip and KPI tiles all consume these fake numbers.
- `getMyTeamStoreCount`, `getStoresVisitedThisMonth`, `getOverdueStoresInScope`, `getPeerAverages` either return hardcoded constants (`87`, `47`) or `[]`.
- Squad feed pulls from `window.PATROL_MOCK_FEED_POSTS` (mock CEO/RSM authors in `js/activity-feed.js`).
- A DSM piloting the app will trust the chart and act on noise. Worse, the Phase C diff just added skeletons & "top performers only" hiding on top of fake data.

Recommended fix: either gate the entire `page-home-dsm` behind a feature flag until real aggregations land (DSM should land on `page-dashboard` v2 which uses real `getStores/getVisits`), or replace each mocked function with a real query (DSM team scope already exists in `db.js#getDirectReports`, `getTeamKPIs`, `getRecentTeamActivity`).
Effort: L

### [P0] Unbounded SAP/HQ visit & user pulls — js/export.js:128-130, 218-222; js/dashboard.js:547-551
What's wrong:
- `exportStores` runs `from('visits').select('store_id, order_amount, visited_at')` with **no filter, no limit, no pagination** — pulls the entire visits table for every admin export.
- `exportSummary` does `from('users').select('*').eq('role','tsr')` (selects every TSR row, including `pin_hash`).
- `dashboard.js#_renderLeaderboardCard` does `from('visits').select('tsr_id, order_amount, order_taken').gte(weekAgo)` — fine for a week but called on every DSM home render.

After a few weeks the export hits Supabase row-limit / PostgREST 1000 default and produces silently truncated reports without warning.
Recommended fix: add `.range()`/pagination, cap to a sensible window (last 90 days), and never `select('*')` from users — explicitly list columns minus `pin_hash`.
Effort: M

### [P0] Service worker / sync handlers stomp on `syncPending` — js/ux-polish.js:226-246
What's wrong:
`_wrapSyncWithToast` reassigns the global `syncPending` to a wrapper. If anything else (or a SW activate event) re-imports the original later, the wrap is lost; if `initUXPolish` is ever called twice (e.g. SPA-style nav rebind) it double-wraps, double-counting the "Na-sync na!" toast and double-firing the toast string. There is no idempotency guard. Pilot users on flaky reload paths will see stale or wrong sync KB numbers.
Recommended fix: guard with `if (syncPending._patrolToastWrapped) return; syncPending._patrolToastWrapped = true;`.
Effort: S

### [P0] DSM-only screens are mounted on TSR critical path — js/home-dsm.js 22 KB, js/dashboard.js 45 KB, js/rsm.js 29 KB, js/sales-tab.js 44 KB
What's wrong: these files (140+ KB minified) are static-loaded for every TSR via `app.html`. CLAUDE.md §2 caps the TSR app at 500 KB cached. Even though TSR doesn't execute the renderers (role gate inside), the parse cost and bytes hit the data plan on first load — a known PRODUCT.md B6 backlog item but still effectively a P0 against the 500 KB rule.
Recommended fix: lazy-import via `<script>` tag insertion or dynamic `import()` on the manager route only. Phase C already started lazy-loading Chart.js / xlsx; extend to manager JS bundles.
Effort: M

### [P1] Unreachable branch in normalizeSessionLanguage — js/auth.js:149
What's wrong:
```js
if (s === 'tl' || s === 'ceb') return s;   // dead — handled by lines above
```
Lines 146-148 already return for every `tl`/`ceb` alias path. Harmless but dead code.
Recommended fix: delete line 149.
Effort: S

### [P1] requireAuth race: returns null then maybe redirects — js/auth.js:504-518
What's wrong: `requireAuth()` returns `null` immediately on miss and only navigates 150ms later in a `setTimeout`. Callers (`app.html` boot, admin pages) treat the return value as truth, then proceed to call `getStores()`, `_renderPulseHead(null)`, etc. before the redirect. Result: noisy console errors, half-rendered shell flashes before redirect.
Recommended fix: make the retry synchronous or block the boot path with a `Promise`-returning `requireAuth()`. As a smaller fix, in `requireAuth` return a sentinel object and have callers short-circuit.
Effort: M

### [P1] Streak walk-back is off-by-one — js/home-extras.js:172-191
What's wrong: The loop tries to allow today to be empty but at line 187 it checks `dayHas[nextKey]` where `nextKey` is `today-2`, not `yesterday`. So if both today and yesterday have visits, the function does break out one day too early. The newer copy in `js/home-tsr.js#getMyStreak` (lines 132-148) has the same shape but at least the "skip today if empty" path is gated by `streak === 0`, so the divergence is silent — two streak calculators with two different definitions.
Recommended fix: pick one implementation, write a unit test for `[today✓, yest✓, day-2✓]` → 3 and `[today✗, yest✓, day-2✓]` → 2.
Effort: S

### [P1] Dual NBA implementations — js/home-tsr.js#computeNextBestAction vs js/home-extras.js#renderNbaHero
What's wrong: Two parallel "next best action" renderers exist. `home-tsr.js` is the live one (Phase 4.6) mounted on `page-home-tsr`. `home-extras.js#renderNbaHero` still ships, writes into `#tsr-nba-container`, sets `window._nbaCurrentId`, exposes `window.skipNba`. `home-tsr.js` also exports a `window.skipNba` (line 703) that **overwrites** the extras one — last script wins. Whichever runs first on `patrol:language-changed` triggers a re-render with stale data.
Recommended fix: delete `js/home-extras.js#renderNbaHero` and its `skipNba` (keep the streak card if still used).
Effort: S — but verify no HTML still calls `renderNbaHero()` first.

### [P1] Memory leak: visit photo object URLs never revoked — js/visit-wizard.js:293, 437
What's wrong:
```js
var url = URL.createObjectURL(blob);     // line 293
img.src = url;                            // never revoked
…
var previewPhotoUrl = _visitData.photo_url || (_visitData.photo ? URL.createObjectURL(_visitData.photo) : '');  // line 437
```
Each submit allocates a fresh blob URL that lives until tab close. After 30+ visits in a day this is megabytes of blob retention on a 2GB phone. The previous URL stored on the `<img>` is never `URL.revokeObjectURL`'d.
Recommended fix: keep a single `_visitData.photoObjectUrl`, revoke on overwrite and on `closeVisitSheet`.
Effort: S

### [P1] XSS in visit chat bubble notes — js/visit-wizard.js:442
What's wrong:
```js
(_visitData.notes ? '<br><span style="…">' + _visitData.notes.substring(0, 80) + '</span>' : '')
```
The preview bubble inserted into `#detail-messages` interpolates `_visitData.notes` straight into innerHTML. Notes is free-text from a TSR — any `<` or scripted attribute survives. Compare with line 109 (`_esc(last.notes.substring(0,80))`) where the previous-visit bubble correctly escapes. Inconsistent escape posture between two adjacent code paths.
Recommended fix: wrap in `_esc()`.
Effort: S

### [P1] Plain `'` is not escaped in HTML-onclick attributes — js/home-extras.js:139, js/dashboard.js:578, 692, 950
What's wrong: Multiple `onclick="openStoreDetail('` + `_esc(s.id)` + `')"` patterns. `_esc` uses `textContent → innerHTML`, which DOES NOT escape `'`. Store/Farm IDs are UUIDs today, but tsr/store NAMES are interpolated into onclick attributes too (e.g. `dashboard.js:578` `showTSRAssignedStores('id','` + safeName + `')` — `safeName` is HTML-escaped but the `'` replacement is added separately and is fragile). Single backslash in a name would break the JS string.
Recommended fix: stop building onclick strings; bind via `addEventListener` / `data-*` and click delegation.
Effort: M

### [P1] role-* CSS class leak on logout — js/nav-role-device.js:109
What's wrong:
```js
b.classList.remove('role-tsr','role-champion','role-dsm','role-rsm','role-exec','role-ceo','role-evp','role-admin');
```
Missing `'role-marketing'` (and any other future role). Logging in as marketing then logging out and back in as TSR leaves `role-marketing` class on body alongside `role-tsr`, breaking role-aware CSS.
Recommended fix: iterate `document.body.classList` and drop anything starting with `role-`, or maintain a single source of truth list.
Effort: S

### [P1] Exec splash "redirectToHq" is a stub, leaves user limbo — js/nav-role-device.js:188-198
What's wrong: `redirectToHq()` shows an alert/toast saying "HQ access is temporarily on hold." and returns. Splash countdown fires this every page-load for exec/evp accounts. After dismissing the alert, user is in `observer-mode` with no bottom nav. There is no way to log out from the splash because `enableObserverMode` runs after, and the More sheet is suppressed in observer mode.
Recommended fix: until HQ deep-link exists, either skip the splash for exec/evp (boot straight into observer mode) or surface a "Sign out" button in `enableObserverMode`'s banner.
Effort: S

### [P1] `setLanguage` re-renders twice and logs 13 lines per switch — js/labels-v2.js:1056-1135
What's wrong: 13 `console.log` debug calls left in production. Worse, lines 1089-1111 render the active page, then line 1112 calls `_rerenderDynamicLocalizedViews()` which re-renders many of the same pages a second time (`renderStoreList`, `updateHomeKPIs`, `renderVisitList`, `initDashboard`, `openStoreDetail`). On a Tindahan page that's two full list rebuilds with Supabase round-trips on every language toggle.
Recommended fix: remove `console.log` lines, and pick one of the two re-render passes.
Effort: S

### [P1] Hardcoded Tagalog/English strings on Assign manager screen — js/assign.js:463, 467, 479, 480, 399, 449
What's wrong: The Phase C diff localised `setAssignMode` titles but missed:
- `updateBulkButton` (`var entity = isFarm ? 'bukid' : 'stores'; btn.textContent = 'I-assign lahat (' + count + ' ' + entity + ') kay ' + _selectedTSR.name;`)
- `bulkAssignAll` `confirm('I-assign ang ' + count + ' ' + entity + ' kay ' + name)`
- `assignToast(_assignEsc(...) + ' assigned kay ' + name, 'success')` and `'Bulk assign failed: ' + err.message`
- `unassignSingleStore`'s `assignToast(isFarm ? 'Farm na-unassign' : 'Store na-unassign')`

DSM/RSM screens are allowed English but the rest of this file uses `_assignT`, so mixing literal Tagalog is inconsistent and the strings will not switch to Bisaya.
Recommended fix: route remaining strings through `_assignT(...)` with new keys; also call `assignToast(msg, ...)` with the already-stringified message (don't pass HTML-escaped values through `textContent` — line 399 escapes pointlessly).
Effort: S

### [P1] Assign toast double-encodes text — js/assign.js:399
What's wrong: `assignToast(_assignEsc(item ? item.name : label) + ' assigned kay ' + _selectedTSR.name, 'success')` — `assignToast` sets `toast.textContent = message`, so the `_assignEsc` call returns `&amp;` etc., which then displays literally inside the toast (the browser does not re-decode for textContent).
Recommended fix: remove the `_assignEsc` wrap; toast already escapes via textContent.
Effort: S

### [P1] Store list health filter does nothing — js/stores.js:1122-1134, 1097-1120
What's wrong: `_getActiveHealthFilter` reads `data-filter-label` and returns `crit|warn|ok`, but `renderTindahan` (called by `initStoreFilters → renderStoreList`) ignores it — the filter is computed only via `_collectTindahanApiFilter` which never reads the chip row. Result: tapping the Critical/Warning/OK chip changes its visual state but does not narrow the list (the Phase 4.7 Tindahan switch removed the filter-honouring call but kept the chip wiring).
Recommended fix: pass `_getActiveHealthFilter()` into `_collectTindahanApiFilter`, or call `renderStoreList({ health_status: _getActiveHealthFilter() })` in the click handler.
Effort: S

### [P1] `getDirectReports` issues 2N Supabase requests on every DSM render — js/db.js:471-485
What's wrong: For each direct report, the function fires two parallel head-count queries (`visits` + `stores`), and the DSM render path calls this twice per home load (`getDirectReports` then `getTeamMembersForStoresFilter` → `getDirectReports` again, then `getMyTsrsWithActivity` → `getDirectReports` once more). For a DSM with 10 TSRs that's ~60+ Supabase round trips on one home open, even though Supabase head:true is cheap individually.
Recommended fix: batch the counts (single `in('tsr_id', allIds)` aggregating client-side), and cache the team list per session.
Effort: M

### [P1] `setPulseRepFilter` re-renders the whole dashboard on each chip tap — js/dashboard.js:1092-1095
What's wrong: Every assignee chip click invokes `renderDashboardV2()` which re-fetches stores + users + visits14 + visits30 from Supabase. The filter is purely client-side — there is no reason to re-pull data.
Recommended fix: cache the four datasets on `window._dsmDashCache`, re-render the queue card only.
Effort: S

### [P1] Camera capture promise hangs on cancel in some browsers — js/camera.js:23-25
What's wrong: `input.oncancel` is non-standard. Safari iOS and several Android WebViews do not fire `cancel` and emit no `change` event either — the promise is never resolved, the `<input>` remains in the DOM, and the Camera button can't be retried (the `_visitData.photo` is null but the wizard thinks an operation is pending). Repeated cancels accumulate orphan inputs.
Recommended fix: also resolve `null` on `window.focus` after a short delay if `files` is still empty.
Effort: S

### [P2] `_esc('0')` returns `''` — js/map.js:673-678, js/dashboard.js:17-22, others
What's wrong: `_esc(s) { if (!str) return ''; … }` returns empty string for numeric `0` (falsy), which makes "0 bags/mo" render as "" in popups.
Recommended fix: `if (str == null) return ''`.
Effort: S

### [P2] `_pulseStrip` declares unused `visits30` param — js/dashboard.js:726
What's wrong: param signature includes `visits30` but body never references it. Confuses readers and the caller wastes a `_renderPulseStrip(stores, users, visits14, visits30)`.
Recommended fix: drop the parameter.
Effort: S

### [P2] Audit-flag `text` field is inconsistently escaped — js/dsm-audit.js:113, 130, 147, 167 vs renderer 195
What's wrong: Three of the four flag types build `text` from raw strings (`'2 visits same day…'`), one (`repeat-visit`) pre-escapes via `_daEsc(storeName)`. The renderer then inserts `f.text` directly. The store name is escaped twice; for the other flags, if any future flag composes user input into `text`, it will hit XSS. Asymmetric defense.
Recommended fix: pick one strategy — either always escape in the producer (then never in the renderer) or always escape at the renderer.
Effort: S

### [P2] `loading.classList.remove('hidden')` with no null check — js/admin-org.js:253, js/admin-users-sap.js:22-30
What's wrong: Both files dereference `loading`, `errBox`, `table` before checking they exist. The `if (loading) setAttribute(...)` guard follows. Will throw if any DOM id was renamed in `admin-org.html` or `admin-users-sap.html`.
Recommended fix: guard before every `.classList` access.
Effort: S

### [P2] Skip-NBA persists per-day list, never garbage-collected — js/home-extras.js:74-89
What's wrong: `localStorage.setItem('patrol_nba_skip_' + today, csv)` — keys accumulate forever, one per active day. After a year a TSR phone has 365 localStorage keys. Each is small but it slows down `localStorage.length` scans and pollutes the keyspace.
Recommended fix: prune anything older than 7 days when writing today's key.
Effort: S

### [P2] `applyVisitPageLabels` runs T-keys without checking T exists — js/visits.js:74-112
What's wrong: All `T.visitsPageTitle`, `T.visitsChipMapping` etc. accessed without a defensive read. If `labels-v2.js` failed to load (slow 2G), `T` is `{}` (auth.js sets it) and the calls work, but the strings render as `undefined`. Visits page would show "undefined" placeholders.
Recommended fix: fall through to the inline English fallback used in `setLanguage`'s rebuild path.
Effort: S

### [P2] `csvEscape` skips quote escape if no special chars — js/admin.js:852-858
What's wrong: A field containing only `"abc` (with leading double-quote) currently is returned unchanged because the regex on line 854 detects the quote, but the wrapping path replaces `"` with `""` — wait, code is OK. False alarm; remove this finding.

(retracted)

### [P2] `_volBadge` returns inline-styled HTML mid-string — js/assign.js:73-83
What's wrong: HTML attribute injection vector — store.vol_class is server data, but if `colors[volClass]` returns undefined (volClass = `"\x22 onload="`), the `'style="' + (undefined || colors.C) + …'` produces `style="background:...` (defaults). Safe today because vol_class is constrained. Worth tightening.
Recommended fix: whitelist vol_class to `['A','B','C']` before composing.
Effort: S

### [P2] `_loadAllDirectSap` 18s timeout swallows server error details — js/sales-tab.js:759-766
What's wrong: AbortController triggers; catch reduces all failures to `TIMEOUT` or `FETCH_EXCEPTION`. The original HTTP status (502/504) returned in the catch is lost because the catch path never sees `res`. DSM watching a stuck Sales tab gets generic "SAP took too long" with no recourse.
Recommended fix: catch the abort separately and fall through to render-with-stale when we have `_lastData`.
Effort: S

### [P2] Sales velocity chart uses constant MOCK_VELOCITY when no real series — js/sales-tab.js:12, 140-147
What's wrong: When `direct.velocity_daily` is empty AND the feature flag `salesVelocityChart` is on (default false per `feature-flags.js`), `MOCK_VELOCITY = [40,55,…]` is rendered. The bar chart looks real but isn't. Comment says "TODO: replace MOCK_VELOCITY with /api/sales/velocity daily series when available". Pilot DSMs will see a chart that is literally always the same shape regardless of region.
Recommended fix: behind the feature flag is OK, but show a "Mock data" badge when MOCK_VELOCITY is the source.
Effort: S

### [P2] `getStores` then `getUsers` for every Squad item — js/db.js:296-353
What's wrong: `getRecentTeamActivity` calls `getStores()` and `getUsers()` to build name maps on every DSM home load. `getStores()` for a DSM/RSM/CEO can return thousands of rows; here we only need a few hundred IDs from the visit set.
Recommended fix: pass the visit set's distinct store_ids/tsr_ids back to a small `.in('id', ids)` lookup.
Effort: M

### [P2] `_renderHeroMetric` divides by hardcoded 450 MT target — js/dashboard.js:166, js/team.js:179
What's wrong: Fallback target of 450 MT is baked into dashboard.js, team.js, dsm-forecast.js. RSM uses a 3-region dictionary. No DB-backed target = "117% of target" is meaningless data.
Recommended fix: store DSM target on `users` row or a `targets` table; until then surface "(no target set)" instead of computing a percentage.
Effort: M

### [P3] `_safeAgeDaysLabel` clamps to 999 but emits `'—'` not 999 — js/dashboard.js:68-72
What's wrong: minor numeric edge; calling code uses it only for badges, OK.
Effort: S

### [P3] `validate.js` ERRORS only carries en + tl (no ceb) — js/validate.js:6-27
What's wrong: Tagalog-only fallback when locale=BIS; violates trilingual rule (PRODUCT.md TSR rules). Low impact because forms also use T.* labels.
Recommended fix: add `ceb` keys.
Effort: S

### [P3] `admin-org.js#showToast` first branch is dead — js/admin-org.js:67-79
What's wrong: `if (typeof window.showToast === 'function' && document.getElementById('admin-toast') == null)` checks for `window.showToast` but never calls it. The first `if` always falls through to "create my own toast", `window.showToast` is never invoked, and the `else alert(msg)` is a duplicate fallback.
Effort: S

### [P3] Two `_esc` helpers / four `escapeHtml` variants across files
Found in dashboard.js (`_ddEsc`), home-tsr.js (`_escapeHtml`), home-dsm.js (`_escapeHtml`), home-extras.js (`_hxEsc`), visits.js (uses `_esc`), stores.js (`_esc`), map.js (`_esc`), rsm.js (`_esc`), team.js (`_teamEsc`), admin.js (`escapeHtml`), admin-org.js (`escapeHtml`), admin-users-sap.js (`escapeHtml`), assign.js (`_assignEsc`), dsm-audit.js (`_daEsc`), dsm-coaching.js (`_dcEsc`), phase4-social.js (`_escapeHtml`), nav-role-device.js (`escHtml/escAttr`), sales-tab.js (`_esc/_attrEsc`), camera/champion/visit-wizard (`_champEsc`).
~15 copies, each subtly different (some handle `0`/`null`, some encode `'`, some don't, some encode `"`). Source of the inconsistent-escape findings above.
Recommended fix: one shared helper exposed on `window.patrolEsc(s)`.
Effort: M

### [P3] Long-press timer captures stale storeId — js/ux-polish.js:9-32
What's wrong: `_longPressStoreId` is module-global; concurrent touches (multi-touch test) overwrite it before the 500ms fires. Real users rarely two-finger, but tests catch it.
Effort: S

### [P3] `getDSMSummary` is dead code — js/db.js:358-391
What's wrong: function defined but not referenced anywhere in `js/` or `app.html`. The DSM dashboard uses `getStores`/`getUsers` directly.
Recommended fix: delete.
Effort: S

### [P3] `dashboard.js` `_alertGradient` palette unused — js/dashboard.js:112-125
What's wrong: only consumer is alerts card line 693 `_alertGradient(s.id)`. Still active. OK — actually used. Retracted.

### [P3] Beta banner re-injects each navigation — js/release-channel.js
What's wrong: IIFE runs once per page load; only one banner. OK.

---

## Phase C diff observations

`git diff` covers `js/assign.js`, `js/home-dsm.js`, `js/sales-tab.js`, `js/export.js`.

- **assign.js**: i18n migration is incomplete (P1 #14, #15). The `assign.stats` key uses HTML inside placeholders and then assigns to `el.innerHTML` — works, but the bound text becomes the literal `<span>{tsrs}</span> TSRs` if the trilingual locales don't include the HTML (they do today — verified in `locales/en.json:187`). Fragile contract between translation key and renderer.
- **home-dsm.js**: skeletons added before the async render, and TSR table is now truncated to top-3 with a "X more team members hidden" note (Filipino hiya rule). Good. But the underlying data is still mock (P0 #3). Skeleton inserts assume that the DOM hosts exist before `renderDsmHome` is called — fine because `renderDsmHome` is the only caller.
- **sales-tab.js**: `_showLoading` and `_render` now emit `aria-busy="true"` and inline skeleton stacks instead of "Loading…" copy. Good and aligned with PRODUCT.md C2. Skeleton CSS lives in `css/sales-tab.css` (out of scope). Minor: the skeleton HTML is duplicated verbatim in two places (`_showLoading` and `_render`) — extract a constant.
- **export.js**: the three `if (typeof window.ensureManagerExportAssets === 'function') await window.ensureManagerExportAssets()` hooks are correct lazy-load checkpoints, but `ensureManagerExportAssets` is defined in `app.html` and is not visible from `js/`. If the symbol is renamed or removed, export silently runs with no SheetJS and throws "XLSX is not defined" inside the catch (line 96). Worth a defensive `if (typeof XLSX === 'undefined') throw new Error(...)` after the await.

---

## Cleanup opportunities

- `js/home-extras.js:91-148` — `renderNbaHero` shadowed by `home-tsr.js`; safe to delete.
- `js/home-extras.js:80-89` — `skipNba` overwritten by home-tsr.js export.
- `js/db.js:358-391` — `getDSMSummary` is dead.
- `js/auth.js:149` — unreachable `if (s === 'tl' || s === 'ceb') return s` branch.
- `js/labels-v2.js:1056-1135` — 13 `console.log` statements, also the duplicate render path at line 1112.
- `js/sales-tab.js:33` — `console.log('TODO: expand sales section —', …)` in production click handler.
- `js/sales-tab.js:73-74` — `card.onclick = function () { console.log('TODO: filter to at-risk'); }` — non-functional TODO handler attached to a visible at-risk card.
- `js/dashboard.js:1041-1042` — "Loading manager home snapshot…" hardcoded English placeholder (PRODUCT.md flagged this category; manager screens may stay English but still inconsistent with the new skeleton-first approach).
- `js/champion.js` heavy inline styles (40+ inline style attrs) — should move to `css/` (PRODUCT.md A1 spirit).
- `js/phase4-social.js` (~52 KB, mostly mock) — entire file gated by `phase4Social` feature flag (default off). Confirm whether to ship at all for pilot.
- `js/activity-feed.js` mock CEO/RSM/DSM posts shipped to every browser — large for what is essentially dummy data; consider gating behind `socialFeed` flag (already declared in `feature-flags.js`).

---

## Test coverage of this layer (gaps)

Agent E owns the full test audit. Flagging only the obvious untested critical paths in this module set:

- `js/auth.js#login` PIN throttling + edge function 401/429 paths — no node:test coverage that I could see beyond `tests/unit/patrol-cors.test.js`.
- `js/db.js` Supabase-mocked CRUD around `getStores`/`assignStores`/`getUnassignedStores` — no unit test stubs.
- `js/home-tsr.js#getMyStreak` and `js/home-extras.js` streak walker have known off-by-one — no test.
- `js/visit-wizard.js#submitVisit` happy path (queue + immediate sync result rendering) — Playwright covers it; no isolated unit test of `_blobToBase64` / `_updateVisitSubmitState`.
- `js/sales-tab.js` cache invalidation (`_lastKey`, `_lastAt`, 28-second TTL) — only `tests/unit/sales-tab-format.test.js` per the handoff covers formatting helpers.
- `js/admin.js#submitAddUser` and CSV export — uncovered. Given the PIN-plaintext issue, a regression test that fails the day PINs leave the server is valuable.
- `js/nav-role-device.js` role → tabs mapping, more-sheet items per role — partial e2e (`08-navigation`) but the marketing/director paths are unverified.
