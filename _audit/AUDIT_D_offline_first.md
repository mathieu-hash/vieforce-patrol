# Audit D — Offline-First Correctness

**Auditor:** Agent D
**Date:** 2026-05-21
**Repo:** `C:\VienovoDev\vieforce-patrol`
**Scope:** `js/offline.js`, `js/db.js`, `js/stores.js`, `js/camera.js`, `js/assign.js`, `js/visit-wizard.js`, `js/visits.js`, `sw.js`, `tests/unit/offline-queue-payload.test.js`, plus all other writers in `js/*` that hit Supabase/`fetch`.
**Rule under audit:** CLAUDE.md §0 RULE 1 — "Write to IndexedDB FIRST. Sync to server SECOND. Never the reverse."

---

## Summary

- **Verdict: NEEDS FIX** (do NOT ship to pilot without addressing P0s)
- **Findings:** P0=4 · P1=4 · P2=5 · P3=2
- **Top 3 data-loss risks:**
  1. **Silent eject after 3 retries** with no transient/permanent error distinction — a flapping cellular link during three sync passes (entirely realistic on Mindanao 2G/3G) deletes the user's record forever. The "Synced ✓✓" UI then lies about it. (`js/offline.js:70-84`, `js/visits.js:526-530`)
  2. **`updateStore` writes bypass the queue entirely** — prospect→active conversion (`js/visit-wizard.js:390`) and `last_visit_at` mark (`js/visit-wizard.js:420`) call Supabase directly with no offline path; the catch is `/* non-critical */`. First-order conversion celebration is lost on every offline submit.
  3. **DSM assignment writes bypass the queue entirely** — `assignStores`, `unassignStores`, `assignFarms`, `unassignFarms` (`js/db.js:772, 783, 838, 849`) all hit Supabase directly. DSM in a coffee-shop with intermittent WiFi loses assignment work; only the toast tells them — the IDB has no record.

---

## Write-path matrix

| Write action | IDB first? | Network optional? | Refresh-safe? | Notes |
|---|---|---|---|---|
| Visit submit (`visit-wizard.js:303`) | **YES** | YES | YES | `queueVisit` before `_attemptImmediateSync`; photo persisted as `photo_base64`. Refresh mid-flight: visit survives in `pendingVisits`. |
| Store create — visit-wizard registration flow (`app.html:2313`) | **YES** | YES | YES | `queueStore` before sync. Photo as base64 in IDB. |
| Store create — chatbot flow (`app.html:2746`) | **YES** | YES | YES | Same pattern; `_chatbotSaveLock` prevents double-tap dupes. |
| Farm create — chatbot flow (`app.html:2776`) | **YES** | YES | YES | `queueFarm`; payload posted to `/api/farms` during sync. |
| `updateStore` — prospect→active conversion (`visit-wizard.js:390`) | **NO** | NO | **NO** | Direct Supabase. Throws when offline. Try/catch logs nothing — conversion event silently lost. |
| `updateStore` — last_visit_at marker (`visit-wizard.js:420`) | **NO** | NO | NO | Direct Supabase, gated on `synced` state. Store list shows stale "last visit" until next online refresh. |
| `assignStores` / `unassignStores` (`assign.js:368, 414, 487`) | **NO** | NO | **NO** | Direct Supabase. DSM gets toast "assigned" but data never persists on flaky link. |
| `assignFarms` / `unassignFarms` (`assign.js:366, 412, 485`) | **NO** | NO | **NO** | Same. |
| `bulkAssignAll` (`assign.js:485`) | **NO** | NO | **NO** | Worst case — DSM bulk-assigns 50 stores, network drops mid-call, partial write or zero write, no offline recovery. |
| Profile / `updateUser` (`admin.js:710, 748, 778`) | NO | NO | NO | Admin path — acceptable to be online-only since admins use desktop, BUT no clear warning to user. |
| `upsertStoreProducts` / `upsertStoreCompetitors` (`db.js:198, 218`) | NO | NO | NO | Store detail edit. Currently appears unused from TSR flow but is a write capability sitting on Supabase. |
| Visit creation in queue → Storage upload (photo) → DB insert (`offline.js:148-157, 183-194`) | n/a | n/a | n/a | **Wrong order during sync.** Photo uploads to Supabase Storage BEFORE `createStore`/`createVisit`. If the insert fails, the photo is orphaned. On retry, photo re-uploads with a new path. Per-failed-retry blob leak in Storage. (Already flagged H-03 in autopsy — fix not yet shipped.) |

---

## Findings

### P0 — Data loss possible on real-world TSR scenario

**P0-1 · Retry counter is a wall clock, not a permanent-error classifier**
- **File / line:** `js/offline.js:52-84`, `js/offline.js:115-210`
- **What:** `MAX_SYNC_RETRIES = 3`. Every failure — transient (network blip, 5xx, Storage throttle, Supabase rate limit) or permanent (PGRST204 schema mismatch) — increments `retry_count`. After three failures across any sync attempts, the record is `await table.delete(record.id)` and gone. A TSR who comes online for 5 seconds three times in a 2-hour stretch (totally normal Mindanao field conditions) loses their visit. Sync UI then says "Naka-sync na ✓✓" because `pending === 0`.
- **Fix:** Distinguish retryable (fetch/network/5xx/429) from permanent (PGRST204, 23502 NOT NULL, 23514 CHECK violation). Only increment retry_count on the permanent class. Cap retries on transient class by elapsed time (e.g., "eject only after 7 days unsynced AND ≥10 attempts AND ≥1 4xx response"). Surface ejected rows to a quarantine view inside the app, never silently `delete()`.
- **Effort:** 4-6h.

**P0-2 · `updateStore` writes bypass the offline queue**
- **File / line:** `js/visit-wizard.js:390-394` (prospect → active conversion) and `js/visit-wizard.js:420` (last_visit_at marker)
- **What:** Both `updateStore` calls go straight to Supabase with no offline branch. On a real TSR's first-order moment — exactly the celebration we ship to drive adoption — the DB update silently fails when offline, the `/* non-critical */` catch swallows it, and the prospect remains a prospect. The conversion celebration may still flash to the user, but the data is wrong.
- **Fix:** Add a `pendingUpdates` table to the queue with `{table, id, patch}` and run it through `syncPending`. Mark conversion + last_visit_at via that path. Same applies to all store updates from the field.
- **Effort:** 6-8h (new queue type + idempotency rules).

**P0-3 · DSM assignment writes bypass the offline queue**
- **File / line:** `js/assign.js:356-453, 473-517`; `js/db.js:772-858`
- **What:** Every `assignStores` / `assignFarms` / `unassignStores` / `unassignFarms` / `bulkAssignAll` call is a raw `supabaseClient.from('stores').update(...).in('id', ...)`. If the DSM is on a wobbly connection (very common — DSMs run between Provincial Capitols and field offices) the Supabase call throws, the catch shows `assignToast('Failed: ' + err.message, 'error')`, but the local state was already optimistically mutated in `_assignStoresAssigned` / `_assignStoresUnassigned`. UI now shows the assignment as done, server doesn't. After page refresh the lists revert. Worst case (`bulkAssignAll` 50+ stores) is a partial write the DSM has no way to detect.
- **Fix:** Either (a) route through queue, or (b) at minimum add a synchronous `navigator.onLine` guard with an honest "Hindi ka online — ulitin kapag may signal" toast that does NOT mutate local state.
- **Effort:** 4h for the guard, 6-8h for queue routing.

**P0-4 · Photo orphans on every sync retry**
- **File / line:** `js/offline.js:148-157` (stores), `js/offline.js:183-194` (visits)
- **What:** Order during sync is: upload photo to Supabase Storage → INSERT row referencing photo URL. If INSERT fails, the photo is orphaned. On retry the catch puts the record back, but `sPayload.photo_url` was a local var, so next pass re-uploads with a new `Date.now()`-based path. After 3 failed retries → blob count = 3 stranded copies in `patrol-photos/` + record ejected. Cumulative effect across the pilot fleet will fill Storage and inflate every TSR's data bill on cellular re-upload.
- **Fix:** Either (a) reverse order — INSERT row with `photo_pending=true`, THEN upload + UPDATE row with URL; or (b) deterministic path keyed on `offline_id` so retries overwrite (`upsert: true` + stable path). Autopsy flagged this as H-03 in April 2026 — not yet fixed.
- **Effort:** 2h.

### P1 — Sync UI lies / silent failures

**P1-1 · "Naka-sync na ✓✓" can show after ejection**
- **File / line:** `js/visits.js:526-530`, `js/offline.js:212-214`
- **What:** `enhancedSyncStatus` checks `pending === 0` → calls `_flashSyncedThenHide()` (green). After an eject the record is deleted, so `pending === 0` is true even though data was lost. `_lastSyncSummary.ejected` is set but only surfaced in the safety-timeout path (`visits.js:553-557`) and after-sync-error path (`visits.js:579-581`), NOT in the success path. The TSR sees a green tick for a write that vanished.
- **Fix:** In the "pending === 0" branch, if `_lastSyncSummary.ejected > 0`, show a red banner "Nawala ang [N] record — i-tap para makita" with a list view. Persist ejected records to a `quarantine` table instead of deleting outright.
- **Effort:** 3h.

**P1-2 · `navigator.onLine` is the only connectivity signal**
- **File / line:** `js/offline.js:311` (CLAUDE.md spec), `js/visits.js:513`, `js/visit-wizard.js:1442`, `app.html:1442`
- **What:** `navigator.onLine` lies: it reflects link-layer state only. On hotel WiFi with no upstream, on captive portals, on 2G with PDP context but no IP route — `navigator.onLine === true` but every fetch will timeout. The code uses it as ground truth to decide "should I attempt sync?" The result is repeated 30s+ Supabase timeouts that count toward the eject limit.
- **Fix:** Treat `navigator.onLine` as a hint, not truth. Confirm connectivity with a lightweight ping (HEAD to Supabase project URL with 3s timeout) before incrementing `retry_count`. If ping fails, treat the underlying sync error as a no-op (don't increment retry_count). The Connection API (`navigator.connection.effectiveType`) is already partially used in `camera.js:78` — extend the pattern.
- **Effort:** 2h.

**P1-3 · "Syncing..." can stick at 10s safety bound after which it shows error even on success**
- **File / line:** `js/visits.js:543-562`
- **What:** The 10s safety timeout fires `setTimeout`, but `syncPending()` for a fleet of 10 queued visits with photos can legitimately take >10s on 3G. The safety timer then shows a red "Sync still pending" badge while the underlying sync is still progressing fine. The bar will flip back to green once sync finishes, but the user briefly sees an error they shouldn't.
- **Fix:** Make the safety timer adaptive: `10s + 2s × pendingCount` capped at 60s. Or move to a cancellable token that's cleared inside the sync loop on each row.
- **Effort:** 1h.

**P1-4 · Sync runs on `window.online` event but not on `visibilitychange` or `focus`**
- **File / line:** `app.html:2900-2901`
- **What:** A TSR submits offline, locks the phone, comes home with WiFi, unlocks Patrol from the home screen — `online` may not re-fire if the radio was already up. If `visibilitychange` returns to visible and `navigator.onLine === true`, we should trigger `autoSync()`. Currently only the `online` event does.
- **Fix:** Add `document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.onLine) autoSync(); })` and a `window.addEventListener('focus', ...)` mirror.
- **Effort:** 30min.

### P2 — Robustness gap

**P2-1 · No storage quota detection / handling**
- **File / line:** `js/offline.js` (entire file); zero references to `navigator.storage.estimate()` or `QuotaExceededError`
- **What:** 5 visits/day × 67KB base64 photo = 335KB/day. 30 days offline = ~10MB. TSR phone with 32GB shared with TikTok/FB/WhatsApp/photos can be at 99% full. When IDB hits quota, `pendingVisits.add()` throws `QuotaExceededError`. The catch in `queueVisit` (none — the throw propagates) lets the error bubble to the caller in `visit-wizard.js:383`, lands in the outer catch at line 452 → shows "❌ may problema. subukan ulit" toast. The TSR doesn't know why and can't free space inside Patrol.
- **Fix:** Call `navigator.storage.estimate()` once at boot. If `quota - usage < 5MB`, show a banner "Mababang storage — i-sync muna". On `QuotaExceededError`, show actionable hint with `patrolInspectQueue` count. Long-term: request `navigator.storage.persist()` to reduce eviction risk.
- **Effort:** 2h.

**P2-2 · Dexie loaded from CDN — single point of failure for cold-load-offline**
- **File / line:** `app.html:1324`
- **What:** `https://unpkg.com/dexie@3/dist/dexie.js` is fetched on every load. If the TSR opens the app for the first time of the day with no signal (no Service Worker cache yet — A2HS not pinned), Dexie never loads, `new Dexie('PatrolOffline')` throws, the queue is dead, and the visit form will throw on submit. Service worker only caches same-origin shell (`sw.js:13` — `unpkg.com` is cross-origin → skipped).
- **Fix:** Self-host Dexie at `/js/vendor/dexie.min.js` (15KB minified). Add to shell cache. Removes external dependency on unpkg uptime + CORS + DNS during a TSR's first offline morning.
- **Effort:** 1h.

**P2-3 · `_attemptImmediateSync` blocks the submit button on online sync**
- **File / line:** `js/visit-wizard.js:407-415`, `app.html:1441-1473`
- **What:** After `queueVisit` succeeds, the button transitions to "Syncing..." and the code `awaits` `_attemptImmediateSync`. On 3G this takes 3-15s. The user sees a quasi-spinner state on what should feel instant. CLAUDE.md RULE 7: "Never show spinners to TSRs". The submit succeeded the moment IDB write finished — the button should immediately flip to "✓ Na-save" and the sync attempt should happen in the background. The current pattern conflates "saved" with "synced" in the UX.
- **Fix:** After `queueVisit`, immediately set button to "✓ Na-save lokal" + green. Run `_attemptImmediateSync` in the background and let the sync bar handle visibility. Close the sheet without waiting.
- **Effort:** 1h.

**P2-4 · IDB schema upgrade chain drops the `territory` secondary index silently**
- **File / line:** `js/offline.js:12-24`
- **What:** v1 declares `cachedStores: 'id, updated_at, territory'`. v2 redeclares `cachedStores: 'id, updated_at'` — the territory index is dropped. No code currently queries by territory on cachedStores, so this is safe today. But a future contributor adding `db.cachedStores.where('territory').equals(...)` will get unexpectedly slow scans. Also: there's no `blocked` event handler — if user has the app in two tabs and one tries to upgrade, IDB blocks indefinitely.
- **Fix:** Document the schema intent; restore `territory` if it's still useful; add `offlineDb.on('blocked', ...)` to surface multi-tab upgrade contention.
- **Effort:** 30min.

**P2-5 · Concurrency lock only covers same-tab; multi-tab still races**
- **File / line:** `js/offline.js:106-113`
- **What:** `_syncRunning` is a module-level JS variable. Two browser tabs of the same Patrol install each have their own `_syncRunning`. Both can `pendingVisits.toArray()`, both call `createVisit`, both succeed → duplicate INSERT. Patched by `patrolIsLikelyDuplicateInsertError` for unique-constraint cases, but `visits` table has no unique constraint on `(tsr_id, store_id, visited_at)` to detect the dupe, so we just create two rows.
- **Fix:** Use Web Locks API (`navigator.locks.request('patrol-sync', { ifAvailable: true }, ...)`) or a sentinel row in IDB itself. Add a unique constraint on visits to backstop.
- **Effort:** 2h.

### P3 — Polish

**P3-1 · Sync result toast estimate "~2KB per record" is wrong when photos sync**
- **File / line:** `js/ux-polish.js:230-235`
- **What:** Tells TSR "~2KB per record" but a synced visit with a photo is ~50KB (compressed photo upload). The "data used" toast undersells reality 25×. Filipino TSRs explicitly worry about data — over-promising on bandwidth saved erodes trust when they check their balance.
- **Fix:** Track actual bytes sent in `uploadPhoto` (`blob.size`) and JSON payload size, sum into `results._bytes`, surface honest number.
- **Effort:** 1h.

**P3-2 · Test coverage gap on the durability + retry semantics**
- **File / line:** `tests/unit/offline-queue-payload.test.js`
- **What:** Existing tests cover (a) field-strip correctness, (b) sync dedup gate, (c) photo_base64 stripping. They do NOT cover: retry-count progression, eject behavior, transient-vs-permanent error split (since the split doesn't exist yet), photo-orphan-on-retry, queue-survives-refresh. Agent E owns the deeper coverage push, but at minimum a regression test for "transient errors don't eject" should be added the moment P0-1 is fixed.
- **Fix:** Add tests once P0-1 is shipped.
- **Effort:** included in P0-1 fix budget.

---

## Queue durability scorecard

- **Survives refresh:** **PASS** — Dexie is transactional, all writes persist immediately. `_syncRunning` is JS-scoped so it's reset on refresh (correct).
- **Survives browser close:** **PASS** — same as above.
- **Survives storage quota:** **FAIL** — no quota detection, no graceful "free up space" UX, `QuotaExceededError` surfaces as a generic submit failure. (P2-1)
- **Survives IDB upgrade:** **PARTIAL PASS** — v1→v2 chain works for additive change (`pendingFarms`). No `blocked` handler — multi-tab open during upgrade hangs silently. (P2-4)
- **Photos compressed before queue:** **PASS** — `compressImage` runs in `capturePhoto` (`camera.js:32-74`) targeting 640×480 + JPEG q0.5. Photos are stored as base64 in IDB (33% inflation but small absolute size). `camera.js:116-118` warns above 80KB but does NOT block.
- **Sync badge truthful:** **FAIL** — "Naka-sync na ✓✓" shows after silent eject (P1-1). Also can show "Sync still pending" error during legitimately long sync (P1-3).
- **Retry semantics safe:** **FAIL** — flat 3-strike retry ejects on transient errors (P0-1).
- **Multi-tab safe:** **FAIL** — sync lock is in-process only (P2-5).
- **Cold-load offline safe:** **FAIL** — Dexie loads from unpkg, not self-hosted (P2-2).

---

## Service worker interaction risks

`sw.js` is **mostly safe for offline-first writes**, with one observation:

- **Cache scope is correctly narrowed** — `isShellAsset` only matches same-origin static assets (HTML, /css/, /js/, /icons/, manifest). Cross-origin (Supabase REST, Supabase Storage, MapLibre tiles, Dexie CDN, supabase-js CDN) is NEVER intercepted.
- **POST/PUT/PATCH/DELETE bypass cache** — line 42 `if (req.method !== 'GET') return;` — writes go directly to network. Correct.
- **Stale GET responses** are possible for cached `/api/...`-flavored data but currently `/api/` is NOT under `isShellAsset` (it's not under `/js/`, `/css/`, etc.) so it's not cached. Confirmed safe.
- **One risk:** Dexie CDN (`unpkg.com`) is cross-origin, so `sw.js` skips it. If a TSR's first cold load is offline, Dexie won't load and the queue is dead. See P2-2.
- **No risk:** Service worker does NOT touch `pendingVisits`/`pendingStores`/`pendingFarms` — those are IndexedDB, not HTTP. SW cannot interfere with queue contents.
- **One latent concern:** `self.skipWaiting()` + `self.clients.claim()` (install + activate) means a deployed SW takes over an open tab without reload. If the new SW changes shell behavior mid-session, a TSR mid-submit could see an inconsistent shell. Low likelihood given Patrol's deployment cadence and the fact that the queue itself is SW-independent.

---

## Memory / storage budget notes

For a 32GB TSR phone with TikTok + FB + Messenger + ~25GB photos, free space typically <2GB.

- **Per visit in IDB:** ~67KB (photo base64) + ~1KB JSON metadata = ~68KB
- **Per store in IDB:** ~67KB (photo) + ~0.5KB metadata = ~68KB
- **Realistic offline burst:** 8 visits/day × 5 days unsynced = 40 visits × 68KB = ~2.7MB. Well within budget.
- **Pathological case:** 30 days offline (a TSR going to a remote barangay without WiFi for a month) × 5 visits = ~10MB. Still safe IF no other IDB pressure.
- **Risk:** A misbehaving Chrome IDB eviction policy under storage pressure can wipe Patrol's IDB. `navigator.storage.persist()` is not requested anywhere (search confirmed: zero references). This means under low-storage conditions Chrome can evict the queue without warning. **This is a silent data loss vector.**

**Recommendation:** Call `navigator.storage.persist()` after first PIN login. Show a one-time Taglish toast: "Pinatatag ang storage para hindi mawala ang data mo."

---

## Reference: clean paths

These are working correctly and should be preserved:

- `queueVisit`, `queueStore`, `queueFarm` — IDB-first, correct order, with `offline_id` + `created_at` stamping.
- `_queuePayload` strip set + PGRST204 regression — covered by unit test, defensive.
- `_syncRunning` in-process dedup — covered by unit test, prevents duplicate INSERT from chatbot double-fire (within same tab).
- `patrolIsLikelyDuplicateInsertError` idempotency on duplicate detection — correctly dequeues without re-insert attempt.
- `STORE_TYPE_ALLOWED` normalisation in `createStore` — defense-in-depth against constraint rejection.
- `_chatbotSaveLock` — layer-1 guard against double-tap chatbot submit.
- Service worker scope — narrow, safe, write-non-intercepting.
- Photo compression pipeline — 640×480 q0.5 enforced at capture time.

---

## Pilot-safe verdict (200-word summary)

**NEEDS FIX — do not ship to pilot without addressing P0s.**

The IDB-first contract is honored on visit submit, store create, and farm create (the three paths the pilot exercises most). Those flows are durable: refresh-safe, close-safe, and properly serialise the photo as base64 inside IndexedDB. The queue itself is well-built and the recent April 2026 fixes (PGRST204 strip, syncPending dedup gate) are solid.

But the surrounding behavior contains four P0 data-loss vectors that will bite during the pilot:

1. **Three-strike retry ejection on transient errors** — a flapping cellular link will silently destroy queued records. The sync UI then shows "Synced ✓✓" green because pending count is zero. TSRs who notice will lose trust; TSRs who don't will keep working against a system they think is saving their work.
2. **`updateStore` writes (prospect conversion + last_visit_at) bypass the queue** — the very celebration moment of "first order from a new POS" is the moment most likely to fail offline.
3. **DSM assignment writes bypass the queue** — the DSM workflow is fragile on intermittent WiFi.
4. **Photo orphans on every sync retry** — known since April (autopsy H-03), still unshipped.

Fix the four P0s (estimated 14-18h) and the pilot is safe. Without them, the first time a TSR's data is silently ejected, adoption is at risk.
