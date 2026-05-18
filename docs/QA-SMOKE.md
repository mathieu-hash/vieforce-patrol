# VieForce Patrol — smoke QA (beta)

Run before tagging a release or after risky merges.

## Auth

1. Open `/index.html`, sign in with a **TSR** test phone + PIN.
2. Confirm redirect to `app.html`, bottom nav visible, no blank shell.

## Core tabs

3. **Home:** KPI strip or feed loads without console errors.
4. **Stores:** list loads; open one store detail if data exists.
5. **Mapa / visits:** open screen (GPS may prompt).
6. **Profile:** name and role visible; language picker opens if present.

## Managers

7. Sign out; sign in with **Google** manager account (allowed domain).
8. Confirm manager shell or DSM/RSM home renders.

## User Admin (roles: ceo, admin, evp, marketing only)

9. Open `/admin.html` — stats + user table load.
10. Search filters rows; **Edit** opens modal; cancel closes. With a modal open: **Tab** / **Shift+Tab** keep focus inside the dialog; **Escape** closes; focus returns to the row action (not lost on the page).
11. Open `/admin-users-sap.html` — SAP roster loads or shows actionable error if HQ token missing.

## Beta channel

12. With `RELEASE_CHANNEL: 'beta'` in `config.js`, orange beta bar shows; dismiss persists per session.

## Automated

13. `npm run test:unit` passes.
14. `npm run test:e2e:all` — full Playwright suite against local static server (`http://127.0.0.1:4173`).
15. `PATROL_E2E_PROD=1 npm run test:e2e:prod-smoke` — `@smoke` tagged checks on production (read-only).

### Playwright coverage map

| Manual check (above) | Spec file |
|----------------------|-----------|
| Auth login UI, session redirect, logout | `tests/e2e/01-auth.spec.ts` |
| Stores list, search, filters, new store chatbot | `tests/e2e/02-stores.spec.ts` |
| Visit bottom sheet, outcomes, offline queue | `tests/e2e/03-visit.spec.ts`, `04-offline.spec.ts` |
| DSM home, KPI, team link, More sheet | `tests/e2e/05-dsm.spec.ts`, `12-assign-team.spec.ts` |
| More sheet (DSM/TSR), scorecard, profile More | `tests/e2e/06-more-sheet-profile.spec.ts` |
| RSM home | `tests/e2e/07-rsm.spec.ts` |
| Role-aware bottom nav | `tests/e2e/08-navigation.spec.ts` |
| Language picker | `tests/e2e/09-language.spec.ts` |
| Profile / phase4 settings | `tests/e2e/10-profile-phase4.spec.ts` |
| Admin SAP roster page | `tests/e2e/11-admin-users-sap.spec.ts` |
| Map tab + sync bar | `tests/e2e/13-map-sync.spec.ts` |
| DSM assign (stores/farms) | `tests/e2e/14-assign-page.spec.ts`, `tests/e2e/15-farms.spec.ts` |

Shared helpers: `tests/e2e/_helpers.ts` (session inject, boot-debug suppress, visit sheet, Dexie `PatrolOffline`).

## Pilot environment checklist (before champion rollout)

| Check | Where |
|-------|--------|
| Supabase migrations applied | `20260430120000_add_user_language.sql`, `sprint-a-phase3-rls-align.sql` |
| Storage bucket `patrol-photos` exists + public read policy (matches `getPublicUrl` in `js/camera.js`) | Supabase Dashboard → Storage; photos queue as `photo_base64` and upload on sync only |
| `HQ_SERVICE_TOKEN` on Vercel (matches HQ Cloud Run) | Vercel env + `/api/sap/*` smoke |
| `SUPABASE_SERVICE_ROLE_KEY` on Vercel (API routes only) | Never in browser |
| Test TSR PIN accounts active | `supabase/migrations/sprint-a-test-accounts.sql` |
| `RELEASE_CHANNEL` in `config.js` matches deploy intent (`beta` vs `stable`) | Orange bar when `beta` |
| `config.js` `VERSION` matches release tag | Footer + SW cache name |
