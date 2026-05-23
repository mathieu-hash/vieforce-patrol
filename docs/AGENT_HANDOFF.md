# VieForce Patrol — External Agent Handoff

Use this document when handing the project to an agent outside Cursor. It is meant to be pasted into the other agent's first message together with repository access.

## Start Here

Repository: `vieforce-patrol`  
Production: `https://vieforce-patrol.vercel.app`  
Current release: `3.2.0-beta.1` (post-6-waves pilot baseline)
Current branch at handoff: `main`

Before changing code, read these files in order:

1. `CLAUDE.md` — non-negotiable product and UX rules.
2. `PRODUCT.md` — product context, auth model, UI backlog, Phase A/B/C.
3. `docs/SESSION_HANDOFF_2026-05-21-complete.md` — detailed project state and architecture notes.
4. `docs/QA-SMOKE.md` — release QA checklist and Playwright coverage.
5. `docs/PATROL-OPS-RUNBOOK.md` — production incident runbook.
6. `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STACK.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/INTEGRATIONS.md`, `.planning/codebase/TESTING.md` if present.

## What This App Is

VieForce Patrol is Vienovo Philippines' field sales execution app. It is a static-first PWA hosted on Vercel, backed by Supabase and Vercel serverless APIs.

Main surfaces:

- `index.html` — phone/PIN login and Google OAuth entry.
- `app.html` — authenticated app shell for TSR, Champion, DSM, RSM, CEO.
- `admin.html` — Sales Admin user management.
- `admin-org.html` — org master for Region/District/Territory.
- `admin-users-sap.html` — SAP roster vs Patrol users.

It is not a React app. The browser shell is static HTML plus vanilla JavaScript globals. Routing happens by toggling `.page.active` sections in `app.html`.

## Hard Product Rules

TSR screens are for low-tech field workers on low-end Android phones with poor connectivity.

Never break these:

- Offline-first writes: IndexedDB first, server sync second.
- TSR touch targets: 64px minimum.
- TSR text: trilingual / localized, not hardcoded English.
- TSR loading: skeletons or cached data, not spinners.
- TSR nav: max 4 bottom tabs.
- No swipe-only actions.
- Photos must stay highly compressed for prepaid data constraints.
- Public leaderboards show top performers only. Never expose low performers publicly.

Manager/admin screens may be denser, but must remain mobile-tolerant and accessible.

## Auth Model

Two login paths:

- TSR / Champion: phone + PIN via Supabase `verify-pin`.
- Managers/Admin/CEO: Google OAuth restricted to `@vienovo.ph`, matched to `users.email`.

Important: manager Google login requires exact profile email in Sales Admin. If a DSM/RSM/CEO has no `users.email`, Google login is blocked even if the Google account is valid.

## Current Implementation Status

Completed:

- Phase A — Admin and auth polish.
- Phase B — TSR field UX: 4-tab nav, 64px TSR controls, skeleton visits, trilingual first paint improvements, manager assets removed from TSR critical path.
- Admin org e2e coverage.
- Phase C — Manager/DSM/RSM polish:
  - Manager nav touch and overflow polish.
  - Sales tab skeleton loading.
  - DSM skeleton-first dashboard rendering.
  - Assign UI localization.
  - Chart.js/Sales CSS/xlsx lazy loading.
  - DSM leaderboard top-performers-only behavior.

Known current non-code artifact:

- `docs/SESSION_HANDOFF_2026-05-21-complete.md` is a full detailed handoff and should be kept with this handoff.

## Validation Commands

Run these before and after meaningful changes:

```powershell
npm install
npm run test:unit
npm run test:e2e:all
```

Production smoke, read-only:

```powershell
$env:PATROL_E2E_PROD='1'
npm run test:e2e:prod-smoke
Remove-Item Env:\PATROL_E2E_PROD -ErrorAction SilentlyContinue
```

Recent verified results before this handoff:

- `npm run test:unit` — 121 tests passed, locale parity 191 keys each.
- Targeted Phase C e2e — 24 tests passed.
- Assign regression e2e — 6 tests passed.
- `npm run test:e2e:all` — 144 tests passed.

## Local Browser Test Note

`playwright.config.ts` intentionally uses `reuseExistingServer: false`. This prevents Playwright from accidentally testing some other app already running on port `4173`.

Do not undo that. It caught a real QA-environment issue where tests were accidentally running against a different local app.

## Secrets And Environments

Do not ask for or paste secrets into chat. Get them through a secure channel.

Likely needed outside Cursor:

- `.env.local`
- Vercel env vars
- Supabase project credentials
- Google OAuth client details
- `SUPABASE_SERVICE_ROLE_KEY`
- `HQ_SERVICE_TOKEN`
- SAP/HQ connection details

Never commit:

- `.env*`
- Supabase service role keys
- Google OAuth secrets
- HQ service tokens
- SAP credentials

## Deployment

Frontend is hosted on Vercel.

Useful scripts:

```powershell
npm run deploy:vercel
npm run check:supabase-auth
npm run sb:link
npm run sb:push
```

Only deploy after tests pass and the user explicitly approves deployment.

## Safe Next Work

Good next tasks:

- Keep expanding e2e around manager/admin flows.
- Review remaining `PRODUCT.md` backlog after Phase C.
- Run production smoke after every deploy.
- Update docs when a phase ships.

Avoid:

- Large framework rewrites.
- Adding heavy TSR dependencies.
- Changing offline queue semantics without full offline tests.
- Moving manager analytics into TSR critical path.
- Adding bottom-ranked users to public leaderboard views.

## First Prompt For An Outside Agent

Suggested prompt:

```text
You are taking over VieForce Patrol. First read CLAUDE.md, PRODUCT.md, docs/AGENT_HANDOFF.md, and docs/SESSION_HANDOFF_2026-05-21-complete.md. This is a static-first Vercel PWA using vanilla HTML/JS/CSS, Supabase, and Vercel APIs. Do not rewrite the app. Preserve TSR non-negotiables: offline-first writes, 64px touch targets, trilingual text, skeletons not spinners, max 4 tabs, no swipe-only actions, and no public low-performer exposure. Before changing code, run git status and inspect current tests. Do not commit or deploy unless asked.
```
