# VieForce Patrol — CLAUDE.md
## Claude Code Project Brief · Vienovo Philippines Inc.
### Version 3.0 — April 2026 · Messenger-Hybrid UX · Low-Tech Field Workers

---

## ⚠️ READ THIS FIRST — HARD RULES FOR TSR SCREENS

These rules come from research on deploying digital tools to low-literacy field workers in the Philippines. They are **non-negotiable**. Do not override them for any reason, including "better UX", "cleaner code", or "standard practice".

```
RULE 1 — OFFLINE FIRST, ALWAYS
  Every single write (visit, store, photo) must work with zero internet.
  Write to IndexedDB FIRST. Sync to server SECOND. Never the reverse.
  If you write to the server first and it fails → TSR loses their work →
  they stop using the app. This kills adoption.

RULE 2 — DATA BUDGET: 6MB/MONTH TOTAL PER TSR
  TSRs pay PHP 15 per 100MB on prepaid. Every KB you waste costs them money.
  - Photos: max 50KB each (640×480, JPEG quality 0.5) — non-negotiable
  - App bundle: under 500KB cached — no heavy libraries, no custom fonts
  - API responses: paginate, never return full datasets
  - No auto-playing media, no large images, no unnecessary polling
  Tell TSRs: "This app uses less data than one Facebook photo."

RULE 3 — TOUCH TARGETS: 64px MINIMUM HEIGHT
  TSRs have calloused hands and use phones outdoors in sunlight.
  Standard 48dp Tailwind buttons (h-12) are too small.
  All interactive elements on TSR screens: minimum h-16 (64px).
  Full-width buttons only. No small icon-only buttons.

RULE 4 — NO SWIPE GESTURES ON TSR SCREENS
  Swipe is invisible and undiscoverable for non-tech users.
  Every action needs an explicit visible button with icon + label.
  No swipe-to-delete, no swipe-to-reveal, no pull-to-refresh.
  Use a visible "I-refresh" button instead of pull-to-refresh.

RULE 5 — TRILINGUAL TEXT ON ALL TSR SCREENS
  Use the T object (Section 17) for every TSR-facing string.
  Never hardcode English text on TSR screens.
  Order: Tagalog first / Bisaya in parentheses / English fallback.

RULE 6 — MESSENGER-HYBRID DESIGN ON TSR SCREENS
  TSR screens use white background + Messenger-blue (#00A6CE) accent.
  NOT the Vienovo navy/dark theme (that is for DSM/RSM/CEO only).
  Store list looks like Messenger inbox. Visit form looks like a chat thread.
  See Section 16 for full design system.

RULE 7 — NEVER SHOW SPINNERS TO TSRs
  Loading spinners = anxiety for low-tech users ("Is it broken?").
  Use skeleton screens (gray placeholder blocks) while loading.
  If data is cached, show cached data immediately.
  Only show a spinner if there is truly zero cached data available.

RULE 8 — ADOPTION RULES (bake into UX, not just onboarding)
  - Leaderboard shows TOP performers only. Never expose low performers publicly.
    Filipino hiya (shame) will cause them to abandon the app.
  - First-login onboarding: max 3 screens, Tagalog, one thing per screen.
  - "Add to Home Screen" prompt after 2nd visit — Taglish label.
  - Never cold-turkey replace paper. App runs parallel for 2 weeks first.
  - Peer Champion: 1 power-user per 10–15 TSRs. App must support them
    seeing their team's data (champion role, future feature).
```

**The test for every TSR screen you build:**
> *"Can a non-tech 45-year-old field worker in Mindanao, with calloused hands, using a Redmi phone on 2G signal, figure out what to do in 10 seconds without anyone explaining it?"*
> If the answer is no → redesign before committing.

---

## 1. PROJECT STATUS & CONTEXT

**Product:** VieForce Patrol — Field CRM & POS Mapping Tool
**Company:** Vienovo Philippines Inc. (VPI) — Animal feed manufacturer, Philippines
**Live URL:** https://web-eta-seven-26.vercel.app
**API URL:** https://patrol-api-*.asia-southeast1.run.app

### What's Already Built ✅
- Auth: PIN login (TSR) + Google OAuth (DSM/EVP)
- Stores: Registration, full 12-section POS visit form, detail pages
- Farms: Registration, full 11-section farm visit form, detail pages
- DSM Pulse: KPIs, alerts, TSR leaderboard, segment distribution
- Territory Map: Leaflet with GPS-plotted stores/farms
- Backend: Express 5 + Drizzle ORM on Cloud Run
- Database: PostgreSQL on Cloud SQL (vieforce-db → patrol)

### Backlog Still To Build 🔧
- [ ] Offline queue (Service Worker + IndexedDB via Dexie.js)
- [ ] Photo upload to GCS (Google Cloud Storage)
- [ ] Store/farm assignment (DSM → TSR)
- [ ] Excel/PDF export (admin only)
- [ ] Custom domain: patrol.vienovo.ph
- [ ] Messenger chatbot integration (daily briefing for TSRs)

### Future: Merge into Vienovo CRM 360°
- Phase 1: Patrol standalone (this repo) ← current
- Phase 2: VieForce HQ standalone (separate repo, SAP B1 data)
- Phase 3: Merge both into vienovo-crm360 unified platform

---

## 2. REAL TECH STACK (verified)

```
Frontend:   Next.js 14 (App Router) + Tailwind CSS
            Deployed on Vercel
            Live: web-eta-seven-26.vercel.app

Backend:    Express 5 + TypeScript + Drizzle ORM
            Deployed on Google Cloud Run (asia-southeast1)
            Live: patrol-api-*.asia-southeast1.run.app

Database:   PostgreSQL on Google Cloud SQL
            Instance: vieforce-db
            Database: patrol

Auth:       PIN login for TSRs (custom)
            Google OAuth for DSM/EVP/RSM

Storage:    Google Cloud Storage (GCS) — for photos
            Bucket: vieforce-patrol-photos (to be created)

Offline:    Dexie.js (IndexedDB) — to be implemented
PWA:        Service Worker — to be implemented
```

---

## 3. ENVIRONMENT VARIABLES

```bash
# Vercel (frontend)
NEXT_PUBLIC_API_URL=https://patrol-api-*.asia-southeast1.run.app
NEXT_PUBLIC_SUPABASE_URL=          # shared auth (future merge)
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Cloud Run (backend)
DATABASE_URL=postgresql://user:pass@/patrol?host=/cloudsql/vieforce-db
GCS_BUCKET=vieforce-patrol-photos
GCS_PROJECT_ID=
JWT_SECRET=
```

---

## 4. DATABASE SCHEMA (Cloud SQL PostgreSQL)

Existing tables — verify with `\dt` in psql before modifying:

```sql
-- Core tables (already exist)
users           -- id, phone, pin_hash, name, role, region, district, territory, is_active
stores          -- id, name, owner_name, phone, address, city, region, lat, lng, photo_url,
                --   health_status, vol_class, cov_class, segment, bags_per_month,
                --   last_visit_at, created_by, created_at
store_products  -- id, store_id, brand, product_group, bags_per_month, is_vienovo
store_competitors -- id, store_id, brand_name, product_group, est_bags_per_month, notes
visits          -- id, store_id, tsr_id, visit_type, lat, lng, photo_url, notes,
                --   order_taken, order_amount, merch_score, offline_id, visited_at
farms           -- id, name, type, location, size, share, segment, heads, lat, lng, created_by

-- To be added (migrations needed)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS assigned_tsr uuid REFERENCES users(id);
ALTER TABLE farms  ADD COLUMN IF NOT EXISTS assigned_tsr uuid REFERENCES users(id);
```

Drizzle schema lives in: `src/db/schema.ts`
Run migrations with: `npm run db:migrate`

---

## 5. REPO STRUCTURE

```
vieforce-patrol/
├── CLAUDE.md                     ← this file
├── .env.local                    ← git-ignored
├── next.config.js
├── package.json
├── tailwind.config.js
├── src/
│   ├── app/                      ← Next.js App Router pages
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── dashboard/page.tsx    ← DSM Pulse
│   │   ├── stores/
│   │   │   ├── page.tsx          ← Store list
│   │   │   ├── new/page.tsx      ← Add store
│   │   │   └── [id]/page.tsx     ← Store detail + visit
│   │   ├── farms/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── map/page.tsx
│   │   └── admin/page.tsx        ← Admin panel (user mgmt)
│   ├── components/               ← Shared UI components
│   ├── lib/
│   │   ├── auth.ts               ← NextAuth config
│   │   ├── api.ts                ← API fetch wrapper
│   │   ├── offline.ts            ← Dexie.js offline queue
│   │   └── camera.ts             ← Photo capture + GCS upload
│   └── db/
│       └── schema.ts             ← Drizzle schema
├── api-server/                   ← Express backend (separate deploy)
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── stores.ts
│   │   │   ├── farms.ts
│   │   │   ├── visits.ts
│   │   │   └── admin.ts
│   │   └── db/
│   │       └── index.ts          ← Drizzle + Cloud SQL connection
│   └── Dockerfile
├── public/
│   ├── manifest.json             ← PWA manifest (to add)
│   └── sw.js                     ← Service Worker (to add)
└── supabase/                     ← Shared auth (future merge only)
```

---

## 6. TSR USER PROFILE — DESIGN CONSTRAINTS

**Critical context: TSRs are very low-tech users.**

```
Device:     Low-end Android (TECNO SPARK, Redmi A3x, Vivo Y-series)
            2–4GB RAM, PHP 3–5K device price
Signal:     75% in remote areas — 2G/3G, frequent drops
Data plan:  Prepaid sachet — PHP 15 per 100MB (every KB costs them)
Literacy:   Low — they use Facebook Messenger, SMS, calls. That's it.
Hands:      Calloused from field work — small targets = rage taps
```

**10 Non-Negotiable Design Rules:**

| # | Rule | Why |
|---|------|-----|
| 1 | 4–5 tabs max, one screen = one action | 0% of low-literacy users navigate hierarchical menus |
| 2 | Taglish UI labels | "I-tap para mag-add ng bagong store" — 6x more engagement |
| 3 | 56–64dp touch targets, full-width buttons | Standard 48dp fails for calloused hands |
| 4 | 100% offline-first — visible sync counter + manual "Sync Now" button | TSRs only get signal at home in the evening |
| 5 | Photos compressed to ~50KB max (640×480, quality 0.5) | 5 photos/day = ~5MB/month total |
| 6 | Total app under 500KB cached | Low-end devices, 32GB storage shared with TikTok/FB |
| 7 | No swipe gestures — explicit buttons only | Swipe is invisible/undiscoverable for non-tech users |
| 8 | 18px+ body text, icon + label on every button | Semi-literate users need both together |
| 9 | Green/Red/Orange status dots — not text-only status | Color coding works across literacy levels |
| 10 | Never show low performers on leaderboard publicly | Filipino hiya — only show top performers |

**Data budget target: ~6MB/month total per TSR**
- App shell: 200KB
- Visit data (text): 200KB
- Photos (5/day compressed): ~5MB
- Catalog sync: 200KB
- Tell TSRs: *"This app uses less data than one Facebook photo."*

---

## 7. OFFLINE QUEUE — IMPLEMENTATION SPEC

**Library:** Dexie.js (IndexedDB wrapper)
**Install:** `npm install dexie`

```typescript
// src/lib/offline.ts
import Dexie from 'dexie'

const db = new Dexie('PatrolOffline')
db.version(1).stores({
  pendingVisits: '++id, offline_id, created_at',
  pendingStores: '++id, offline_id, created_at',
  cachedStores:  'id, updated_at, territory'
})

// Queue a visit when offline
export async function queueVisit(data: VisitPayload) {
  await db.pendingVisits.add({
    ...data,
    offline_id: `${data.tsr_id}_${Date.now()}`
  })
  updateSyncBadge()
}

// Auto-sync when back online
window.addEventListener('online', syncPending)

export async function syncPending() {
  const pending = await db.pendingVisits.toArray()
  for (const visit of pending) {
    try {
      await api.post('/visits', visit)
      await db.pendingVisits.delete(visit.id)
    } catch (e) {
      break // stop on first failure, retry next time
    }
  }
  updateSyncBadge()
}

// Sync status indicator
export function updateSyncBadge() {
  const count = await db.pendingVisits.count()
  const el = document.getElementById('sync-badge')
  if (!el) return
  if (!navigator.onLine) {
    el.textContent = `Offline · ${count} pending`
    el.className = 'badge-orange'
  } else if (count > 0) {
    el.textContent = `Syncing...`
    el.className = 'badge-blue'
  } else {
    el.textContent = `Synced ✓`
    el.className = 'badge-green'
  }
}
```

**UI requirement:** Persistent sync indicator in the top bar, always visible. Include a manual "I-sync ngayon" (Sync Now) button on the home screen.

---

## 8. PHOTO UPLOAD — IMPLEMENTATION SPEC

**Storage:** Google Cloud Storage
**Bucket:** `vieforce-patrol-photos`
**Folder structure:** `{tsr_id}/{YYYY-MM-DD}/{timestamp}_{store_id}.jpg`

```typescript
// src/lib/camera.ts

// Step 1: Capture (mobile camera or file picker)
export async function capturePhoto(): Promise<Blob | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment'  // rear camera on mobile
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return resolve(null)
      const compressed = await compressImage(file)
      resolve(compressed)
    }
    input.click()
  })
}

// Step 2: Compress aggressively — target 50KB
export async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    const img = new Image()
    img.onload = () => {
      // Max 640px wide
      const scale = Math.min(1, 640 / img.width)
      canvas.width  = img.width  * scale
      canvas.height = img.height * scale
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(resolve as BlobCallback, 'image/jpeg', 0.5) // quality 0.5
    }
    img.src = URL.createObjectURL(file)
  })
}

// Step 3: Upload to GCS via backend (never direct from browser)
export async function uploadPhoto(blob: Blob, path: string): Promise<string> {
  const formData = new FormData()
  formData.append('photo', blob, path)
  const res = await fetch('/api/photos/upload', {
    method: 'POST',
    body: formData
  })
  const { url } = await res.json()
  return url
}

// WiFi-only option (respect TSR data budget)
export function isWifiConnected(): boolean {
  const conn = (navigator as any).connection
  return conn?.type === 'wifi' || conn?.effectiveType === '4g'
}
```

**Backend route (Cloud Run):**
```typescript
// api-server/src/routes/photos.ts
// POST /photos/upload
// Uses Google Cloud Storage client library
// Returns signed URL with 7-day expiry
```

---

## 9. STORE/FARM ASSIGNMENT (DSM → TSR)

**Migration needed first:**
```sql
ALTER TABLE stores ADD COLUMN IF NOT EXISTS assigned_tsr uuid REFERENCES users(id);
ALTER TABLE farms  ADD COLUMN IF NOT EXISTS assigned_tsr uuid REFERENCES users(id);
CREATE INDEX stores_assigned_tsr_idx ON stores(assigned_tsr);
CREATE INDEX farms_assigned_tsr_idx  ON farms(assigned_tsr);
```

**Admin UI:**
- DSM sees list of TSRs in their district
- Per TSR: shows their assigned stores count + unassigned stores in territory
- Drag or tap to assign stores to TSRs
- Bulk assign: "Assign all MM-North stores to Rico Abante"

**TSR filter:** When TSR logs in, `getStores()` filters by `assigned_tsr = currentUser.id`

---

## 10. EXCEL/PDF EXPORT

**For DSM and Admin only — not TSRs.**

```typescript
// Excel: use exceljs
// npm install exceljs

// PDF: use @react-pdf/renderer (Next.js) or pdfkit (backend)

// Export endpoints:
// GET /api/export/visits?format=xlsx&period=MTD&tsr_id=
// GET /api/export/stores?format=xlsx&region=
// GET /api/export/summary?format=pdf&period=MTD
```

Reports to generate:
- Visit summary by TSR (MTD/weekly)
- Store coverage map (all stores + last visit date)
- DSM territory report (KPIs, leaderboard, segment distribution)

---

## 11. MESSENGER CHATBOT (preferred over Push Notifications)

**Why Messenger over browser push:** TSRs already live on Messenger. Push notification permission dialogs confuse low-tech users. Messenger chatbot is zero-friction.

**Stack:** Meta Messenger Platform (Webhook) + Node.js handler on Cloud Run

**Daily flow:**
```
6:30 AM → "Magandang umaga, [Name]! 5 stores para bisitahin ngayon:"
          → [Store 1] [Store 2] [Store 3] [Store 4] [Store 5]
          → "I-tap ang store para mag-log ng visit"
          → Deep link → patrol.vienovo.ph/visit?store=xxx

End of day (6 PM) → "Magaling! Nag-log ka ng [X]/[Y] visits ngayon.
                     [Remaining stores] pa ang hindi nabisita."
```

**Messenger → App deep link pattern:**
```
https://patrol.vienovo.ph/quick-visit?store_id=xxx&tsr_id=yyy
```
Opens app directly to visit form for that store. Pre-fills store name.

---

## 12. PWA SETUP

### `public/manifest.json`
```json
{
  "name": "VieForce Patrol",
  "short_name": "Patrol",
  "description": "Vienovo Philippines — Field Sales Tool",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#004D71",
  "theme_color": "#004D71",
  "lang": "fil",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Service Worker strategy
```javascript
// Cache first for app shell
// Network first for API calls
// Queue writes when offline (via Dexie.js)
// Show "You are offline" banner — never a white screen
```

**Install prompt:** Show "Add to Home Screen" banner after 2nd visit. Label it: *"I-save ang app sa iyong phone"*

---

## 13. CUSTOM DOMAIN

**Target:** patrol.vienovo.ph

**Steps:**
1. Vercel Dashboard → Domains → Add `patrol.vienovo.ph`
2. Add CNAME record in DNS: `patrol → cname.vercel-dns.com`
3. Vercel auto-provisions SSL certificate
4. Update all API URLs in env vars to use new domain
5. Update Messenger webhook URL to new domain

---

## 14. ADOPTION STRATEGY (bake into onboarding UX)

**Peer Champion Model:**
- 1 tech-comfortable TSR per 10–15 people
- They get "Digital Champion" title + PHP 50/month load allowance
- They are the first line of support, not IT

**Rollout sequence:**
1. Week 1: Champion TSRs only (10–15 people)
2. Week 2: Run paper forms AND app in parallel (never cold-turkey)
3. Week 3–4: Full rollout with champions as support
4. Month 2: Paper forms retired

**In-app onboarding for TSR (first login):**
- 3-screen animated walkthrough in Tagalog/Filipino
- Each screen = 1 thing: "Ganito mag-log ng store" / "Ganito mag-kuha ng litrato" / "Ganito mag-sync"
- Skip button always visible

**Company provides:** PHP 50–100/month data allowance per TSR. Removes biggest barrier to adoption.

---

## 15. BUILD ORDER (for new Claude Code session)

```
Phase A — Offline Queue (most critical, do first)
  [ ] 1.  npm install dexie
  [ ] 2.  Create src/lib/offline.ts
  [ ] 3.  Add sync badge to top nav (all TSR screens)
  [ ] 4.  Add "I-sync ngayon" button to home screen
  [ ] 5.  Wire visit submit to use queueVisit() when offline
  [ ] 6.  Wire store create to use queueStore() when offline
  [ ] 7.  Test: submit visit offline → queue → reconnect → auto-sync → verify in DB

Phase B — Photo Upload
  [ ] 8.  npm install @google-cloud/storage (backend)
  [ ] 9.  Create GCS bucket vieforce-patrol-photos
  [ ] 10. Create src/lib/camera.ts with compression
  [ ] 11. Add POST /photos/upload route in Cloud Run API
  [ ] 12. Wire photo capture to store + visit forms
  [ ] 13. Test: capture photo → compress to ~50KB → upload → URL stored in DB

Phase C — Store/Farm Assignment
  [ ] 14. Run migration: add assigned_tsr column
  [ ] 15. Update getStores() to filter by assigned_tsr for TSR role
  [ ] 16. Build assignment UI in admin page (DSM view)
  [ ] 17. Test: DSM assigns store → TSR logs in → only sees assigned stores

Phase D — Excel/PDF Export
  [ ] 18. npm install exceljs @react-pdf/renderer
  [ ] 19. Build export API endpoints
  [ ] 20. Wire export buttons in admin panel
  [ ] 21. Test: export MTD visits as XLSX → opens in Excel correctly

Phase E — Messenger Chatbot
  [ ] 22. Create Meta App + Messenger webhook
  [ ] 23. Build chatbot handler in Cloud Run
  [ ] 24. Daily briefing: 6:30 AM, today's stores list
  [ ] 25. End-of-day summary: visits logged / remaining
  [ ] 26. Deep links: Messenger → app visit form

Phase F — PWA + Custom Domain
  [ ] 27. Create public/manifest.json
  [ ] 28. Create public/sw.js (service worker)
  [ ] 29. Register SW in layout.tsx
  [ ] 30. Generate icons (192px + 512px) in Vienovo navy
  [ ] 31. Add "Add to Home Screen" prompt (Taglish label)
  [ ] 32. Configure patrol.vienovo.ph in Vercel
  [ ] 33. Update DNS CNAME record
  [ ] 34. Test: "Add to Home Screen" on Android Chrome → opens as standalone app

Phase G — UX Polish (apply throughout)
  [ ] 35. Audit all touch targets → minimum 56dp height
  [ ] 36. Add Taglish labels to all TSR-facing screens
  [ ] 37. Add "You are offline" banner (orange, never white screen)
  [ ] 38. Add loading skeletons (not spinners) for all data loads
  [ ] 39. Onboarding walkthrough (3 screens, Tagalog, first login only)
```

---

## 15. ADOPTION STRATEGY — BAKED INTO UX

This is not an HR plan. These are **UX features** that must be built into the app to drive adoption among low-tech Filipino field workers.

### 15.1 Peer Champion Support
```
Role: "Digital Champion" — 1 per 10–15 TSRs
Access: Can see their assigned TSRs' visit counts (read-only)
UI:     Champion gets a special home screen view showing their team:
        "Koponan mo ngayon (Your team today)"
        ┌─ Rico Abante      ████░░░░ 3/8 visits ─┐
        ├─ Jake Santos      ██████░░ 5/7 visits  ─┤
        ├─ Maria Cruz       ██░░░░░░ 2/8 visits  ─┤
        └─ Ben Reyes        █░░░░░░░ 1/6 visits  ─┘
        Champion can tap a TSR name to see their store list (not visit details)
        This lets champions help teammates without DSM overhead
```

### 15.2 Leaderboard Rules
```
SHOW:   Top 3 performers (gold/silver/bronze badges)
        Current user's own rank always (even if #47)
NEVER:  Bottom performers, exact counts for low rankers, public failure

Example leaderboard widget on home:
  🥇 Jake Santos      18 visits this week
  🥈 Rico Abante      16 visits this week
  🥉 Maria Cruz       14 visits this week
  ─────────────────────────────────────
  Ikaw: #8 · 9 visits (keep going! 💪)

This uses Filipino pakikisama (group harmony) and friendly competition
without triggering hiya (public shame).
```

### 15.3 Onboarding Walkthrough (first login only)
```
3 screens max. Skip button always visible.
Screen 1: "Kamusta! 👋 Ako si Patrol."
          Big illustration: phone with store list
          "I-tap ang tindahan para mag-log ng bisita mo"
          [Susunod →]

Screen 2: "Madali lang! 📸"
          Big illustration: camera + checkmark
          "Kumuha ng litrato. Piliin ang outcome. Tapos na."
          [Susunod →]

Screen 3: "Kahit walang signal ✅"
          Big illustration: phone with offline icon → wifi icon → sync tick
          "Sine-save namin lahat. Mag-sync kapag may signal na."
          [Magsimula na!]

After Screen 3: straight to store list. No more modals, no tutorials.
```

### 15.4 "Add to Home Screen" Prompt
```
Show after: user's 2nd login (not 1st — let them try it first)
Text: "I-save ang Patrol sa iyong home screen para mas mabilis!"
      [I-save 📱] [Mamaya na]
Style: Bottom sheet, not a modal. Non-blocking. Dismissible.
```

### 15.5 Data Usage Reassurance
```
Show once on first sync (after first visit submitted):
"✅ Na-sync na! Ginamit: 12KB lang.
 Katumbas ng 0.1% ng iyong 100MB load."
This directly addresses the biggest barrier: fear of wasting data.
```

### Philosophy
TSRs know one app deeply: **Facebook Messenger**. The Patrol TSR UI borrows Messenger's visual language and interaction patterns so the app feels instantly familiar — not a foreign work tool, but something that feels like the app they use every day. This is a hybrid: Vienovo-branded, but Messenger-patterned.

### What to Borrow from Messenger

| Messenger Element | Patrol Equivalent | Implementation |
|---|---|---|
| Chat thread list | Today's store visit list | Each store = a "conversation row" |
| Contact avatar circle | Store initial circle (colored by health) | Green=ok, Orange=warn, Red=critical |
| Bold name = unread | Bold store name = not visited today | Unbold after visit logged |
| Last message preview | Last visit summary ("Nag-order · 30 bags") | Gray subtext under store name |
| Timestamp right-aligned | Last visit date | "2d ago", "Kahapon", "Ngayon" |
| Blue send button | Submit visit / Log order | Full-width, blue, large |
| 📷 photo icon in input bar | Kumuha ng litrato | Camera icon, tap = open camera |
| ✓✓ blue ticks = delivered | Synced to server | Double tick green = synced |
| ⏱ gray clock = sending | Pending offline queue | Orange clock = waiting to sync |
| Story circles (top row) | Priority stores today (urgent ring) | Stores not visited in 7+ days get orange ring |
| Online green dot | Store health status | Dot on avatar |
| "Type a message..." | "Dagdag ng notes..." | Placeholder text in notes field |
| Reaction bar (👍❤️😮) | Quick outcome buttons | "May Order" / "Walang Order" / "Bukas ulit" |
| Long press = options | Long press store = quick actions | Call owner / Get directions / Mark visited |

### Color System (Messenger-inspired, Vienovo-branded)

```css
/* Background: White like Messenger, not dark navy */
--bg-main:     #FFFFFF;
--bg-chat:     #F0F2F5;   /* Messenger gray background */
--bg-bubble:   #FFFFFF;   /* Visit card = message bubble */

/* Accent: Vienovo Blue replaces Messenger Blue */
--accent:      #00A6CE;   /* Primary blue = Vienovo Corporate Blue */
--accent-dark: #004D71;   /* Navy = Messenger dark blue equivalent */

/* Status dots (same as Messenger online/offline) */
--status-ok:   #31A24C;   /* Green = visited recently / healthy */
--status-warn: #F7B928;   /* Yellow = needs visit soon */
--status-crit: #FA383E;   /* Red = not visited 7+ days / critical */

/* Sync status (mirrors Messenger message states) */
--sync-done:   #00A6CE;   /* Blue double tick = synced */
--sync-pending:#F7B928;   /* Orange clock = queued offline */
--sync-error:  #FA383E;   /* Red = failed to sync */

/* Text */
--text-primary:   #050505;  /* Messenger near-black */
--text-secondary: #65676B;  /* Messenger gray = subtext */
--text-muted:     #8A8D91;  /* Timestamps, hints */
```

### Typography
```css
/* Messenger uses system fonts — do the same for performance */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
             Roboto, Helvetica, Arial, sans-serif;

/* Sizes — bigger than standard for calloused hands outdoors */
--text-name:    17px / 700;   /* Store name = contact name */
--text-preview: 14px / 400;   /* Last visit = message preview */
--text-time:    13px / 400;   /* Timestamp */
--text-body:    16px / 400;   /* Form fields, notes */
--text-button:  17px / 600;   /* Action buttons */
```

### Store List Screen (Home — TSR)

Looks like Messenger inbox. Each row:
```
┌─────────────────────────────────────────────────────┐
│  [●]  Golden Feed Supply           Kahapon  ··      │
│  (G)  Caloocan · 120 bags/buwan                     │
│       Nag-order · 30 bags ViePro                    │
└─────────────────────────────────────────────────────┘
│  [!]  Santos Agri Center           5d ago   ○       │
│  (S)  Valenzuela · 80 bags/buwan                    │
│       Hindi pa nabibisita ngayong linggo             │
└─────────────────────────────────────────────────────┘
```

Where:
- `(G)` = circle avatar with store initial, colored by health status
- `●` = green dot (visited recently) / `!` = orange (needs visit) / `✕` = red (critical)
- `··` = blue double tick (last visit synced) / `○` = gray clock (pending)
- Bold name = unvisited today, normal weight = visited

### Visit Form Screen

Looks like opening a Messenger chat thread:
```
┌─ ← Golden Feed Supply ──────── 📞 ──────────────┐
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ 📍 Caloocan, Bulacan                        │ │  ← Store info bubble
│  │ 👤 Maria Santos · 09171234567               │ │
│  │ 📦 120 bags/buwan · VPI Share: 67%          │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ Kahapon — J. dela Cruz                      │ │  ← Previous visit bubble
│  │ ✓ Nag-order · 30 bags · ₱45,000            │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ═══════ I-log ang visit ngayon ═══════           │
│                                                   │
│  [  May Order  ] [  Walang Order  ] [  Bukas  ]   │  ← Quick outcome chips
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ 📷  Dagdag ng litrato...                    │ │  ← Photo + notes bar
│  │ ✏️  Dagdag ng notes...                      │ │     (like Messenger input)
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │         ✅  I-SUBMIT ANG VISIT              │ │  ← Big blue button
│  └─────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

### Sync Status Bar (always visible, top of screen)

```
Online + synced:   [●  Naka-sync na  ✓✓]           ← green, subtle
Offline + queue:   [○  Offline · 3 pending  ↑]     ← orange, prominent
Syncing:           [↻  Nag-sisync...         ]      ← blue, animated
Error:             [✕  Hindi na-sync · I-retry]     ← red, tappable
```

### Bottom Navigation (TSR — 4 tabs max)

```
┌──────────┬──────────┬──────────┬──────────┐
│    🏠    │    🏪    │    🗺    │    👤    │
│  Bahay   │  Stores  │   Mapa   │  Profile │
└──────────┴──────────┴──────────┴──────────┘
```

Active tab: blue, others: gray. No text on inactive. Messenger bottom tab pattern.

### Quick Outcome Chips (after opening a store)

Instead of a long form, first ask one big question visually:

```
Ano ang nangyari sa bisita mo?

┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│      🛍     │  │     😐      │  │      📅     │
│  May Order  │  │  Nakausap   │  │  Bukas ulit │
│             │  │  Walang     │  │             │
│             │  │    Order    │  │             │
└─────────────┘  └─────────────┘  └─────────────┘
```

Tap one → expands to relevant mini-form only. Tap "May Order" → shows bag count + product. Tap "Nakausap" → shows notes only. Tap "Bukas ulit" → just logs attempt, done.

This reduces the 12-section form to a 2-tap flow for the most common scenario.

---

## 17. TRILINGUAL LABEL SYSTEM

All TSR-facing text uses **3 languages in priority order**: Tagalog first, Bisaya (Cebuano) in parentheses for Mindanao TSRs, English as universal fallback.

### Key Labels

```typescript
export const T = {
  // Navigation
  home:        'Bahay (Balay)',
  stores:      'Mga Tindahan',
  map:         'Mapa',
  profile:     'Profile ko',

  // Store list
  visitToday:  'Bisitahin ngayon (Bisitahon karon)',
  notVisited:  'Hindi pa nabibisita (Wala pa nabisita)',
  lastVisit:   'Huling bisita (Katapusang bisita)',
  daysAgo:     (n: number) => `${n} araw na ang nakakaraan`,
  today:       'Ngayon (Karon)',
  yesterday:   'Kahapon (Kagabie)',

  // Visit outcomes
  withOrder:   'May Order (Adunay Order)',
  noOrder:     'Walang Order (Walay Order)',
  comeback:    'Bukas ulit (Ugma pag-usab)',

  // Actions
  submitVisit: 'I-SUBMIT ANG VISIT',
  takePhoto:   'Kumuha ng litrato (Kuhaa og litrato)',
  addNotes:    'Dagdag ng notes (Dugangi og notes)',
  syncNow:     'I-sync ngayon (I-sync karon)',

  // Sync status
  synced:      'Naka-sync na (Na-sync na)',
  offline:     'Offline',
  pending:     (n: number) => `${n} naghihintay (naghulat)`,
  syncing:     'Nag-sisync... (Nag-sync...)',
  syncError:   'Hindi na-sync. I-retry? (Dili na-sync. I-retry?)',

  // Errors / empty states
  noStores:    'Wala pang tindahan sa lugar mo.',
  noSignal:    'Walang signal. Sine-save namin ang data mo.',
  submitOk:    '✅ Na-save! Mag-sync kapag may signal.',
  submitFail:  '❌ May problema. Subukan ulit.',

  // Onboarding
  welcome:     'Maligayang pagdating sa VieForce Patrol!',
  step1title:  'I-tap ang tindahan para mag-log ng bisita',
  step2title:  'Kumuha ng litrato at i-lagay ang order',
  step3title:  'I-sync kapag may internet na',
}
```

---

## 18. COMPONENT LIBRARY (TSR-SPECIFIC)

Build these reusable components implementing the Messenger-hybrid design:

### `<StoreRow />` — The core component
```tsx
// Looks like a Messenger chat row
// Props: store, lastVisit, syncStatus, onTap, onLongPress
// Health dot color from store.health_status
// Bold name if not visited today
// Preview text = last visit outcome
// Timestamp = relative ("Kahapon", "2d ago")
// Sync tick = ✓✓ blue if synced, ○ gray if pending
```

### `<OutcomeChips />` — First question on visit
```tsx
// 3 big tappable chips: May Order / Walang Order / Bukas ulit
// Tap expands to relevant mini-form
// No scrolling, everything visible above the fold
```

### `<VisitBubble />` — Previous visit display
```tsx
// Looks like a received message bubble (gray, left-aligned)
// Shows: date, TSR name, outcome, order amount if any
// Right-aligned timestamp, sync status tick
```

### `<SyncBar />` — Always-on sync status
```tsx
// Sticky top bar, only shows when offline or syncing
// Hidden when online + synced (don't distract)
// Tappable when error (retry action)
```

### `<PhotoCapture />` — Camera button
```tsx
// Looks like Messenger camera button (blue circle, camera icon)
// On tap: opens rear camera immediately
// Shows thumbnail preview after capture
// Compresses to ~50KB before storing
// Uploads when online, queues when offline
```

### `<BigButton />` — Primary action
```tsx
// Full width, 64px height minimum
// Messenger-blue background (#00A6CE)
// White bold text, 17px
// Used for: Submit Visit, Sync Now, Save Store
```

---

## 19. UPDATED BUILD ORDER (Messenger UX first)

```
Phase 0 — Messenger-Hybrid UX Foundation (DO FIRST)
  [ ] 0.1  Apply color system (Section 16) to Tailwind config
           tailwind.config.js: add all --accent, --status-*, --sync-* colors
  [ ] 0.2  Build <StoreRow /> component (Messenger chat row pattern)
  [ ] 0.3  Build <SyncBar /> component (sticky, offline-aware)
  [ ] 0.4  Build <OutcomeChips /> component (3-chip outcome selector)
  [ ] 0.5  Build <VisitBubble /> component (message bubble = past visit)
  [ ] 0.6  Build <BigButton /> component (full-width, 64px, Messenger blue)
  [ ] 0.7  Build <PhotoCapture /> component (camera button)
  [ ] 0.8  Implement T (translations) object (Section 17)
  [ ] 0.9  Replace all TSR-facing screen text with T.* labels
  [ ] 0.10 Replace store list rows with <StoreRow /> 
  [ ] 0.11 Replace visit form top section with <VisitBubble /> history
  [ ] 0.12 Replace visit form CTA with <OutcomeChips /> + <BigButton />
  [ ] 0.13 Add <SyncBar /> to root layout (all TSR screens)
  [ ] 0.14 Test on real low-end Android in Chrome
           Pass/fail: "Can a non-tech 45-year-old use this in 30 seconds?"

Phase A — Offline Queue (as before, now with Messenger sync UX)
  [ ] A.1  npm install dexie
  [ ] A.2  Wire offline queue to <SyncBar /> status
  [ ] A.3  Sync tick icons on <StoreRow /> (✓✓ or ○)
  [ ] A.4  Manual sync button on home screen ("I-sync ngayon")
  [ ] A.5  Test offline → queue → reconnect → auto-sync

Phase B — Photo Upload (as before)
  [ ] B.1  Wire <PhotoCapture /> to GCS upload
  [ ] B.2  Compress to 50KB before any storage/upload
  [ ] B.3  Show thumbnail in <VisitBubble /> after upload

Phase C — Store/Farm Assignment (as before)
Phase D — Excel/PDF Export (as before — DSM/Admin only)
Phase E — PWA + Custom Domain (as before)

Phase F — Polish
  [ ] F.1  Long-press store row → quick action sheet
           (Call owner / Get directions / Mark visited)
  [ ] F.2  Onboarding: 3-screen walkthrough in Tagalog
           Screen 1: "I-tap ang tindahan para mag-log"
           Screen 2: "Kumuha ng litrato · Lagay ang order"
           Screen 3: "Mag-sync kapag may signal na"
  [ ] F.3  Empty state screens (Taglish, friendly illustration)
  [ ] F.4  "Magandang araw!" greeting with TSR name on home
```

---

## 20. FUTURE: CRM 360° MERGE

When Patrol beta and HQ beta are both stable:

```
vienovo-crm360/
├── modules/patrol/     ← this codebase (Messenger-hybrid UI)
├── modules/hq/         ← HQ codebase (executive BI)
├── shared/auth/        ← unified PIN login (same users table)
├── shared/nav/         ← role-based navigation shell
└── api/                ← both backend API layers

Note: The Messenger-hybrid UI is TSR-only.
DSM/RSM/CEO use the VieForce HQ design system (navy, data-dense).
The merge shell detects role and renders correct design system.
```

---

## 21. NOTES FOR CLAUDE CODE

- **TSR screens = Messenger-hybrid design (Section 16).** DSM/RSM/CEO screens keep the current Vienovo navy/professional style.
- **Every TSR screen must use T.* translation labels (Section 17).** No hardcoded English strings on TSR-facing screens.
- **Low-tech test:** Every TSR change must pass — "can a non-tech 45-year-old in Mindanao use this in 30 seconds without explanation?"
- **Offline is not optional.** Every write must work without internet. Queue → sync pattern always.
- **Compress photos hard.** Max 50KB. 640×480 at 0.5 JPEG quality.
- **Touch targets: 64px minimum height** on all TSR-facing interactive elements.
- **No spinners for TSRs.** Use skeleton screens or cached data. Spinners cause anxiety for low-tech users.
- **No swipe gestures.** Explicit buttons only. Swipe is invisible to non-tech users.
- **Never show loading spinners to TSRs.** Use skeleton screens or cached data.
- **Do not add npm packages without confirming** — bundle size matters for 2G/3G devices.
- **Run `npm run db:migrate` after any schema changes** — never edit DB directly.
- **Vienovo brand (DSM/RSM/CEO screens):** Navy `#004D71`, Blue `#00A6CE`, Green `#95C93D`, Gold `#F1B11D`
- **Messenger-hybrid (TSR screens):** White background, `#00A6CE` accent, system fonts, health dots

---

*CLAUDE.md v3.0 · April 2026 · Vienovo Philippines Inc.*
*Stack: Next.js 14 + Express 5 + Drizzle + Cloud SQL + Cloud Run + Vercel*
*UX: Messenger-hybrid (TSR) + Vienovo executive (DSM/RSM/CEO)*
