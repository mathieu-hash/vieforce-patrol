# VieForce Patrol User Manual (Field + Manager + Sales Admin)

Last updated: 2026-05-08  
Environment: Production (`https://vieforce-patrol.vercel.app`)

---

## 1) What Patrol is for

VieForce Patrol is the day-to-day execution app for:

- Field reps (`tsr`, `champion`) to manage stores and log visits.
- Managers (`dsm`, `rsm`) to monitor team activity and coach.
- User Admin roles (`ceo`, `admin`, `evp`, `marketing`) to review user alignment via the standalone User Admin pages.

Primary outcomes:

- Keep store follow-through consistent.
- Capture visit activity and order signals quickly.
- Maintain clear user-role and SAP roster alignment.

---

## 2) Access URLs

Use these direct URLs in production:

- Main login: `https://vieforce-patrol.vercel.app/`
- Main app shell: `https://vieforce-patrol.vercel.app/app.html`
- User Admin (core): `https://vieforce-patrol.vercel.app/admin.html`
- User Admin + SAP roster (standalone): `https://vieforce-patrol.vercel.app/admin-users-sap.html`

### Access control reminder

`admin-users-sap.html` depends on `/api/admin/sap-reps`, which allows only:

- `ceo`
- `admin` (Sales Admin)
- `evp`
- `marketing`

If a user gets `403 Forbidden`, confirm their role in `users.role`.

---

## 3) Quick visual reference

## Login screen

Patrol login screen

What to check:

- Phone number + PIN fields are visible.
- Correct language is selected.
- User lands in role-appropriate home after login.

## Sample home shell (automation capture)

Patrol sample home shell

Use this as a visual baseline for:

- Header + sync status
- Core tabs and page rendering
- No broken layout in mobile webview

---

## 4) Standard user flows

## A. Login

1. Open `https://vieforce-patrol.vercel.app/`.
2. Enter mobile number and PIN.
3. Tap **Login**.
4. Confirm role-appropriate landing:
  - TSR/Champion -> TSR home shell
  - DSM -> DSM home shell
  - RSM -> RSM home shell

Troubleshooting:

- "Invalid PIN": verify `users.pin_hash` setup.
- "No internet": Patrol requires online auth at login.
- Role mismatch: verify `users.role`, `users.is_active`.

## B. Stores workflow (all field roles)

1. Open **Stores** tab.
2. Use search to find store by name/owner/phone.
3. Open store detail thread.
4. Review last visit and status chips.

Expected behavior:

- List should scroll smoothly in mobile webview.
- Store rows open detail reliably.
- Priority/health indicators display correctly.

## C. Log a Visit (current behavior)

Visits are now expected to be triggered from:

- Store detail "start visit" actions, or
- **More -> Log Visit** shortcut.

Steps:

1. Open **More**.
2. Tap **Log Visit**.
3. Complete visit form (type, notes, order info if applicable).
4. Submit and confirm sync status.

Expected behavior:

- Visit flow opens without requiring a dedicated Visits tab.
- Submit button provides clear state feedback.
- Offline entries queue and sync when online.

## D. DSM Squad read-only feed

1. Login as DSM.
2. Open DSM Home.
3. Scroll to Squad activity.

Expected behavior:

- Squad shows latest team activity.
- Composer is read-only (no posting actions).
- Leaderboard shortcut is hidden.

---

## 5) More menu policy (current rollout mode)

Current temporary policy:

- Use **More** as overflow actions.
- Keep unfinished modules hidden.
- Keep HQ access on hold for now.

Current user-visible intent:

- Keep only ready actions.
- Reduce accidental entry to unfinished modules.
- Keep mobile flow focused on execution.

---

## 6) Sales Admin guide (standalone User Admin web access)

This section is for Sales Admin and leadership users managing roster alignment.

## A. Open the standalone page

1. Login with a Sales Admin-eligible role.
2. Open: `https://vieforce-patrol.vercel.app/admin-users-sap.html`

What this page provides:

- Active SAP OSLP rep roster.
- Patrol linked/unlinked status.
- Manager linkage (`u_rsm`) visibility.
- CSV export for audit/sharing.

## B. Daily checklist for Sales Admin

Run this at least once per day:

1. Review **Not in Patrol** rows.
2. Verify linked role and phone quality.
3. Check vacant/misaligned rep records.
4. Export CSV for updates with leadership.

## C. Common actions

- Search by rep code/name -> validate matching Patrol user.
- Filter for unlinked rows -> assign/fix user profile in Patrol user admin.
- Export CSV -> share clean-up list with operations.

## D. Access problems

If the page loads but data fails:

- Confirm role is one of `ceo|admin|evp|marketing`.
- Check session validity (re-login if expired).
- Confirm `/api/admin/sap-reps` is reachable.

---

## 7) Screenshot pack checklist (recommended)

To make onboarding easier, capture and store fresh screenshots in `docs/manual-screenshots/`:

- `01-login-screen.png`
- `02-tsr-home.png`
- `03-stores-list.png`
- `04-store-detail.png`
- `05-more-menu-log-visit.png`
- `06-visit-form.png`
- `07-dsm-squad-readonly.png`
- `08-admin-users-core.png`
- `09-admin-users-sap-standalone.png`

Recommended capture standard:

- Mobile viewport for field flows.
- Desktop viewport for admin pages.
- Include one "success state" per critical flow.

---

## 8) FAQ

**Q: Why is there no dedicated Visits tab now?**  
A: Visit entry is intentionally simplified into Store detail + More shortcut during this phase.

**Q: Why can’t users open HQ from Patrol now?**  
A: HQ access is temporarily held to keep this rollout focused and avoid unfinished cross-app paths.

**Q: Who should use `admin-users-sap.html`?**  
A: Sales Admin and authorized leadership (`ceo`, `admin`, `evp`, `marketing`).

---

## 9) Release-ready verification checklist

- Login works for TSR, DSM, RSM, Sales Admin.
- Stores list loads and scrolls properly on mobile webview.
- More menu shows only ready actions.
- Log Visit entry works from More.
- DSM Squad feed is read-only and visible.
- Leaderboard is hidden.
- HQ access is blocked/held.
- `admin-users-sap.html` works for authorized roles.
- CSV export works on standalone User Admin SAP page.