# UAT Personas — VieForce Patrol Pilot Walk-Through

**Date seeded**: 2026-05-26 · `scripts/seed-uat.mjs`
**Live at**: https://vieforce-patrol.vercel.app
**PIN for all 7 personas**: `1234`
**Teardown**: `node scripts/seed-uat.mjs --teardown` (deletes every row tagged `[UAT]` + phones 0917-0000-100..130)
**Re-seed**: `node scripts/seed-uat.mjs` (idempotent on users; rewrites stores/farms/visits)

---

## The hierarchy

```
Carlos Reyes (RSM, NCR)                                   09170000100
├── Jake Santos (DSM, Caloocan-Bulacan)                   09170000110
│   ├── Ben Tolentino (TSR, Caloocan-North)               09170000120
│   └── Junjun Garcia (TSR, Bulacan-South)                09170000121
└── Maria Cruz (DSM, Valenzuela-Quezon)                   09170000111
    ├── Aileen Villanueva (TSR, Valenzuela-East)          09170000122
    └── Manny dela Cruz (TSR, Quezon-West)                09170000123
```

---

## Data shape per TSR

- **20 POS** (stores) — name format `[UAT] {real-ish store name} — {CAL/BUL/VAL/QUE}-{01..20}`, lat/lng inside the territory bounding box, mix of store_type / vol_class / cov_class
- **5 farms** — `[UAT] Bukid ni {owner} {1..5}`, mix of hog/poultry/gamefowl/aqua/dairy/mixed
- **Visits over the last 14 days** with a staggered profile so the leaderboard tells a story:

| TSR | Avg visits/store | Total ~ | Leaderboard position |
|---|---|---|---|
| Ben Tolentino | ~4.5 | ~90 | 🥇 #1 (top performer) |
| Aileen Villanueva | ~4.2 | ~84 | 🥈 #2 |
| Junjun Garcia | ~3.8 | ~76 | 🥉 #3 |
| Manny dela Cruz | ~3.0 | ~60 | #4 — needs DSM attention |

Visit outcomes randomized 60% **may order** / 30% **walang order** / 10% **bukas ulit**.

---

## Walk-through per role

### TSR — log in as **Ben Tolentino** (09170000120 / 1234)
**What to check (the TSR critical path)**:
1. ✅ Login flow — phone+PIN, no spinner, lands on TSR home
2. ✅ TSR home — 20 stores in the list (Messenger-style chat rows), health dots, "Kahapon" / "2d ago" timestamps
3. ✅ Stores tab — search "[UAT]" finds his territory; filters work; tap into a store
4. ✅ Visit log — bottom sheet with 3 outcome chips (May Order / Walang Order / Bukas ulit); submit one new visit, verify it queues to IndexedDB
5. ✅ Bukid (farms) tab — 5 farms visible, register a new one via chatbot flow
6. ✅ Mapa tab — pins for his stores within Caloocan area
7. ✅ Profile — language switch (Tagalog ↔ Cebuano ↔ English), `<html lang>` should update with each switch (a11y win from R8 T3)
8. ✅ Offline test — turn off network in DevTools; submit a visit; verify queue shows pending; reconnect; verify drain
9. ✅ 64px tap targets across header buttons, search, NBA buttons, FAB

**What Ben should NOT see**: any of the other 3 TSRs' stores, DSM/RSM nav tabs, admin shells.

### TSR — log in as **Manny dela Cruz** (09170000123 / 1234)
The low-performer baseline. Confirm:
- Leaderboard widget shows top 3 + Manny's own rank (hiya rule — never expose him publicly as ranked #4)
- His visit count is genuinely lower than Ben's
- Same critical path as above works

### DSM — log in as **Jake Santos** (09170000110 / 1234)
**What to check (DSM Pulse)**:
1. ✅ DSM home — KPI grid, TSR performance table showing Ben + Junjun ranked
2. ✅ Squad / team page — shows Ben + Junjun only (district-scoped); not Aileen or Manny
3. ✅ Assign page — drag/select stores → assign to a TSR; both Tindahan and Bukid tabs work
4. ✅ Sales tab — DSM-level aggregates (mocked SAP data behind the proxy)
5. ✅ More sheet — manager-side controls; profile; logout
6. ✅ Activity feed — recent visits from Ben + Junjun visible

**What Jake should NOT see**: Maria Cruz's TSRs (Aileen/Manny), admin shells, RSM aggregates.

### DSM — log in as **Maria Cruz** (09170000111 / 1234)
Mirror of Jake but for the Valenzuela-Quezon side. She sees Aileen + Manny only.

### RSM — log in as **Carlos Reyes** (09170000100 / 1234)
**What to check (regional view)**:
1. ✅ RSM home — regional KPI rollup across both districts
2. ✅ Manager nav includes Stores tab (Wave 5 fix)
3. ✅ All 4 TSRs visible (district scoping = entire NCR for an RSM)
4. ✅ Both DSMs visible in any chain-of-command UI
5. ✅ Sees stores across all 4 territories
6. ✅ More sheet has RSM-specific menu items

---

## Specific behaviors worth poking

| Behavior | How to trigger | Expected |
|---|---|---|
| **Hiya leaderboard rule** (Rule 8) | Login as Manny (rank #4), check his home | Top 3 + Manny's own line; never bare ranks 4-N publicly |
| **Offline-first** (Rule 1) | DevTools → Offline → submit visit | "Na-save offline" toast; sync icon orange clock; reconnect drains |
| **Trilingual** (Rule 5) | Profile → Language → Cebuano | All TSR strings re-render in Bisaya |
| **Trilingual lang attr** (R8 T3) | Same as above, inspect `<html>` | `lang="ceb"` after switch |
| **Skip-link** (R8 T3) | Press Tab on any page (keyboard nav) | "Skip to main content" link appears top-left |
| **64px taps** (Rule 3) | DevTools → device emulate Redmi A3x | All TSR interactive elements ≥64px (no rage taps) |
| **No spinners** (Rule 7) | Refresh during data load | Skeleton rows, never `<spinner>` |
| **Manager JS lazy-load** (R8 T2) | Login as TSR, watch Network tab | sales-tab/dashboard/rsm/team JS NOT loaded; ~954KB saved |
| **Sync badge truth** (W2 + W4) | Go offline, watch the sync badge | NEVER green when offline (orange clock instead) |
| **#00A6CE brand consistency** (R8 T4) | Compare manifest theme-color + Android Chrome address-bar tint | Both `#00A6CE`, no flicker on install |

---

## When you're done

**Wipe the seed**:
```powershell
node scripts/seed-uat.mjs --teardown
```

That deletes every row tagged `[UAT]` (users by phone, stores/farms by name prefix, visits by store FK cascade). Idempotent — safe to re-run.

**Re-seed for another round**:
```powershell
node scripts/seed-uat.mjs
```

Stores + farms + visits get fresh data each run (users are upserted, so persona phones stay stable).

**Quick row-count verify**:
```powershell
node scripts/seed-uat.mjs --verify
```

---

## Found a bug? Where to file it

- TSR critical-path issue → `docs/PILOT-KNOWN-ISSUES.md` (manual) OR a sticky note for the next session
- DSM/manager surface → check `docs/quality-gate-vieforce-patrol-2026-05-25-r8.md` first — most known gaps are listed there
- Real auth regression → check `docs/PATROL-OPS-RUNBOOK.md` → "Login broken after a Supabase auth migration" before anything else

---

*Cheat-sheet generated 2026-05-26 post-R8 push. Quality gate sits at 89.5/110 PASS — this UAT is the real-world test against the gate.*
