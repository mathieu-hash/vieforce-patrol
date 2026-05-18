# VieForce Patrol — tester UAT checklist (pilot / preview build)

**Purpose:** Give field testers and DSM champions a **short, repeatable** pass/fail sheet. Not a developer test plan.

**How to use**

1. Your team lead will send a **build URL** (often a Vercel *preview* link, or production when promoted).
2. Replace every `YOUR_BUILD_URL` below with that link (example: `https://vieforce-patrol-xxx.vercel.app`).
3. Check **Pass** or **Fail** for each row. For **Fail**, write what you saw in **Notes** (screenshot helps).
4. Sign at the bottom and return to the team lead.

| Tester name | |
|-------------|---|
| Date | |
| Phone model / browser | |
| Build URL | |

---

## Before you start

- [ ] Phone has **Chrome** (or the browser your team asked you to use).
- [ ] You know your **test account** (mobile + PIN, or Google login for managers).
- [ ] For offline tests: you know how to turn **airplane mode** on/off.

---

## A. Login and first screen

| # | Check | Pass | Fail | Notes |
|---|--------|------|------|-------|
| A1 | Open `YOUR_BUILD_URL/` — login page loads (no blank white page). | ☐ | ☐ | |
| A2 | PIN login: enter number + PIN → you reach the **home** screen without getting stuck. | ☐ | ☐ | |
| A3 | (Managers only) Google login works if your team enabled it for this build. | ☐ | ☐ | N/A if PIN only |

---

## B. TSR / Champion — stores and visits

| # | Check | Pass | Fail | Notes |
|---|--------|------|------|-------|
| B1 | Open **Stores** — list loads; you can scroll without the app freezing. | ☐ | ☐ | |
| B2 | Tap a store — **detail** opens with name/address and actions. | ☐ | ☐ | |
| B3 | From **More** (or store actions your team showed you), open **Log visit** — form opens. | ☐ | ☐ | |
| B4 | Submit a **test visit** (minimal notes ok) while **online** — you see a clear success message and no endless spinner. | ☐ | ☐ | |
| B5 | **Offline:** turn airplane mode **on** → log another visit or save something your team asked → app says data is **saved / queued** (not “lost”). | ☐ | ☐ | |
| B6 | Turn airplane mode **off** → use **Sync** (or wait for auto sync if your team said so) → pending count goes **down** or clears. | ☐ | ☐ | |

---

## C. Mapa (TSR / Champion)

| # | Check | Pass | Fail | Notes |
|---|--------|------|------|-------|
| C1 | Tap **Mapa** tab — page opens (list or map, depending on build settings). | ☐ | ☐ | |
| C2 | If you see **“open full map”** (or similar) — tap it — full map page opens without crash. | ☐ | ☐ | N/A if not shown |

---

## D. DSM / manager (only if you test manager accounts)

| # | Check | Pass | Fail | Notes |
|---|--------|------|------|-------|
| D1 | Home or dashboard loads after login. | ☐ | ☐ | |
| D2 | **Assign** (or territory assignment screen your team named) — you can open it and see lists; no instant error toast. | ☐ | ☐ | N/A if not in pilot |
| D3 | **Squad / activity** area — read-only; no broken layout. | ☐ | ☐ | |

---

## E. Farms (only if pilot includes farms)

| # | Check | Pass | Fail | Notes |
|---|--------|------|------|-------|
| E1 | Open **Farms** (or path your team gave) — list loads. | ☐ | ☐ | N/A |
| E2 | Open one farm — detail loads; optional test visit if team asked. | ☐ | ☐ | N/A |

---

## F. Sales Admin page (only if you have `ceo` / `admin` / `evp` / `marketing` test user)

| # | Check | Pass | Fail | Notes |
|---|--------|------|------|-------|
| F1 | Open `YOUR_BUILD_URL/admin-users-sap.html` — page loads. | ☐ | ☐ | N/A |
| F2 | Table or roster appears (not only “access denied”). | ☐ | ☐ | N/A |
| F3 | **Export CSV** (if present) downloads or opens a file. | ☐ | ☐ | N/A |

---

## G. Install on home screen (optional)

| # | Check | Pass | Fail | Notes |
|---|--------|------|------|-------|
| G1 | “Add to home screen” or install prompt — if shown, you can dismiss or accept without crash. | ☐ | ☐ | |

---

## Known limitations (do not fail the build for these unless your team says otherwise)

- **Sales / SAP deep modules** may show “temporarily unavailable” if the server is not wired for live SAP on this preview — your team will say if that is expected.
- **Mock social / extra charts** stay **off** on normal pilot builds unless IT turns flags on.

More detail for champions: `docs/PILOT-KNOWN-ISSUES.md`.

---

## Sign-off

| Role | Name | Signature / date |
|------|------|-------------------|
| Tester | | |
| Team lead review | | |

---

## For team leads (internal)

- Technical smoke matrix: `docs/PRE-RELEASE-SMOKE-CHECKLIST.md` and `docs/QA-SMOKE.md`.
- Full user-facing guide: `docs/PATROL-USER-MANUAL.md`.
