# VieForce Patrol — Security Hardening Proposal

**Date:** 2026-05-29
**Status:** PROPOSAL — awaiting Mat's decision. Nothing here is executed yet.
**Context:** App is live, quality gate **89.5/110**. Security is the one capped dimension (5/10). This is the path to **95+/110**. Mat asked: *"for security what do you propose?"*

---

## TL;DR recommendation

Do these in **this order**, smallest-blast-radius first. Items 1 & 2 are low-risk and I can do them in a follow-up session without touching live auth. Items 3 & 4 are the real work and need a deliberate, tested rollout because they touch how every user logs in.

| # | Item | Effort | Risk to live pilot | Score impact | My recommendation |
|---|------|--------|--------------------|-------------|-------------------|
| 1 | Origin enforcement in `verify-pin` | ~1h | **Low** | Security +0.5 | **Do first** — pure add, no auth-behavior change |
| 2 | Server-mediate `users` mutations | ~1 day | **Low–Med** | Security +1, Code Quality +1 | **Do second** — moves writes behind API, RLS tightens |
| 3 | bcrypt the PIN store | ~2–3h code + **coordinated reset** | **HIGH** (can lock out live users) | Security +1.5 | **Do third, gated** — needs a migration + reset plan |
| 4 | Drop CSP `'unsafe-inline'` | ~1–2 days | **Med–High** (huge surgical surface) | Security +1, Code Quality +1 | **Do last** — biggest regression risk |

**If all four ship:** Security 5 → ~8.5, Code Quality 7 → ~9, Overall **89.5 → ~95+**.

---

## Item 1 — Origin enforcement in the `verify-pin` Edge Function

**What's wrong now.** `supabase/functions/verify-pin/index.ts` reflects the request `Origin` back in CORS headers rather than checking it against an allow-list. Any site can POST to the function. Brute-force throttling exists (`BRUTE_FORCE_THRESHOLD` + delay), but there's no origin gate.

**Fix.** Add an allow-list check at the top of the handler (reuse the `PATROL_CORS_ORIGINS` convention already used by `api/_lib/patrol-cors.js`). Reject non-allowed origins with 403 before touching the DB. Keep the existing throttle.

**Risk.** Low. The only failure mode is mis-listing a legitimate origin (the vercel.app URL + `patrol.vienovo.ph` + localhost for dev). Easy to verify with a curl smoke test against each origin before deploy.

**Rollback.** Redeploy the previous function version (`npm run sb:fn:deploy-verify-pin`).

---

## Item 2 — Server-mediate `users` table mutations

**What's wrong now.** `js/db.js` mutates the `users` table directly via the anon Supabase client (create/update user, language). W1.6 left RLS open on app tables so the offline-queue replay works. That means a crafted anon request can write to `users` within whatever RLS allows.

**Fix.** Route all `users` writes through a Vercel serverless endpoint (`api/admin/users/*` already exists for reset-pin — extend the pattern) that uses the service-role client and enforces role checks server-side. Then tighten the `users` RLS to revoke anon writes. Leave `stores`/`visits`/`farms` anon-writable (offline replay depends on them — do NOT touch those).

**Risk.** Low–Medium. The risk is breaking the admin create/edit-user flow or the language-save path. Mitigated by: the e2e admin specs (11, 17, 18) + the new hybrid-auth fixes already in place. Test admin user CRUD end-to-end before deploy.

**Rollback.** Revert the RLS migration + the endpoint commit. Additive endpoint means old client code keeps working until RLS is tightened, so this can ship in two safe steps (endpoint first, RLS-tighten second).

---

## Item 3 — bcrypt the PIN store  ⚠️ HIGH RISK to live users

**What's wrong now.** `verify-pin/index.ts:183` compares `user.pin_hash === pin` as **plaintext**. PINs are stored in the clear in the `users.pin_hash` column. The seed + admin reset write plaintext too.

**Why it's risky.** This is the single change that can lock out all 7 live UAT personas (and any real pilot users). If you hash existing PINs but the verify path or a stray seed still writes/expects plaintext, logins fail silently with "Invalid credentials."

**Safe rollout plan (the only way I'd do this):**
1. Add bcrypt verify with a **dual-read** window: `verify-pin` tries bcrypt first, falls back to plaintext-equals, and on a successful plaintext match **re-writes the hash as bcrypt** (lazy migration). No user is locked out; PINs upgrade as people log in.
2. Update the admin reset-PIN endpoint + seed script to write bcrypt from then on.
3. After all active users have logged in once (check `updated_at` / a `pin_algo` flag), drop the plaintext fallback in a second deploy.

**Effort.** ~2–3h code; the real cost is the staged rollout + watching login success over a few days.

**Risk.** High if done as a one-shot rehash; **Low** with the dual-read lazy-migration above. I recommend the staged version only.

**Rollback.** Keep plaintext fallback until step 3 — that IS the rollback. Don't remove it until login telemetry is clean.

---

## Item 4 — Drop CSP `'unsafe-inline'`

**What's wrong now.** `vercel.json` CSP allows `'unsafe-inline'` for scripts because the app uses `onclick="..."` attributes throughout `app.html` (160KB) and the admin shells. `'unsafe-inline'` defeats most of CSP's XSS protection.

**Fix.** Sweep every inline `onclick=`/`on*=` handler to delegated `addEventListener` listeners, then remove `'unsafe-inline'` from the script-src directive.

**Why it's last.** This is the largest surgical surface in the codebase — hundreds of handlers across the visit sheet, store list, admin, manager screens. Every one is a regression opportunity. The Messenger-hybrid TSR screens are the highest-stakes (Rule 1–8). This needs its own dedicated session with full e2e coverage re-run after each batch.

**Effort.** ~1–2 days. **Risk.** Medium–High purely from volume.

**Rollback.** Per-batch commits; revert any batch that breaks a spec.

---

## What I am NOT proposing

- No change to the **hybrid auth model** (PIN + OAuth). It works and is well-tested. bcrypt is about storage, not the model.
- No touching `stores`/`visits`/`farms` RLS — offline replay depends on anon writes (CLAUDE.md Rule 1).
- No hand-signed JWTs — this project is asymmetric/JWKS (documented lesson, CLAUDE.md §21).

---

## Suggested sequencing for a security session

```
Session S1 (half day):  Item 1 (origin) + Item 2 step 1 (endpoint)        → deploy, verify
Session S2 (half day):  Item 2 step 2 (RLS tighten) + Item 3 step 1 (bcrypt dual-read) → deploy, watch logins
Session S3 (2 days):    Item 4 (CSP onclick sweep), batched + e2e per batch → deploy
Session S4 (15 min):    Item 3 step 3 (drop plaintext fallback once logins clean)
```

Tell me which items to schedule and I'll execute them with this safety plan.
