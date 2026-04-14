# VieForce Patrol — Master Project Plan
## Claude Code Project Brief · Vienovo Philippines Inc.

---

## 1. PROJECT OVERVIEW

**Product:** VieForce Patrol — Field CRM & POS Mapping Tool
**Company:** Vienovo Philippines Inc. (VPI) — Animal feed manufacturer
**Purpose:** Enable 200 Territory Sales Representatives (TSRs) to map, visit, and track all Point-of-Sale (POS) stores and farms in their territory. Data feeds into VieForce HQ (executive BI dashboard) and Vienovo CRM 360°.

**Current State:**
- Working HTML prototype at `https://web-eta-seven-26.vercel.app`
- Source: `prototype.html` — single-file HTML/CSS/JS, Leaflet maps, Chart.js
- All data is hardcoded mock data — no backend
- Deployed on Vercel

**Goal:** Replace mock data with live Supabase backend. Keep the existing UI/UX intact. Add auth, GPS capture, photo upload, offline sync, and admin panel.

---

## 2. TECH STACK

```
Frontend:   Vanilla HTML/CSS/JS (existing prototype — do NOT migrate to React)
            Supabase JS SDK v2 (cdn.jsdelivr.net)
            Dexie.js (IndexedDB for offline queue)
            Leaflet.js (maps — already in prototype)
            Chart.js (charts — already in prototype)

Backend:    Supabase (PostgreSQL + Auth + Storage + Edge Functions)
            Project URL: [TO BE SET — add to .env]
            Anon Key:    [TO BE SET — add to .env]

Auth:       Custom PIN auth via Supabase Edge Function
            (NOT Supabase's built-in email/OTP auth)

Storage:    Supabase Storage bucket: "patrol-photos"

Hosting:    Vercel (existing — keep as-is)

Config:     /config.js — exports SUPABASE_URL and SUPABASE_ANON_KEY
```

**Environment Variables (Vercel + local):**
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

---

## 3. DATABASE SCHEMA

Run this SQL in Supabase → SQL Editor. Execute in order.

### 3.1 Users Table
```sql
create table public.users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,           -- e.g. "09171234567"
  pin_hash text not null,               -- bcrypt hash of 4-6 digit PIN
  name text not null,
  role text not null check (role in ('tsr','dsm','rsm','admin')),
  region text,                          -- e.g. "Luzon"
  district text,                        -- e.g. "Metro Manila"
  territory text,                       -- e.g. "MM-North"
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for phone lookup
create index users_phone_idx on public.users(phone);

-- RLS
alter table public.users enable row level security;
create policy "Users can read own record"
  on public.users for select
  using (auth.uid()::text = id::text);
create policy "Admins can read all users"
  on public.users for all
  using (
    exists (
      select 1 from public.users u
      where u.id::text = auth.uid()::text
      and u.role = 'admin'
    )
  );
```

### 3.2 Stores Table (POS Master)
```sql
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_name text,
  phone text,
  address text,
  city text,
  province text,
  region text,
  store_type text check (store_type in ('feeds_dealer','farm_supply','pet_shop','veterinary','supermarket','other')),
  lat double precision,
  lng double precision,
  photo_url text,                       -- Supabase Storage URL
  health_status text default 'ok' check (health_status in ('ok','warn','crit')),
  vol_class text check (vol_class in ('A','B','C')),        -- volume class
  cov_class text check (cov_class in ('A','B','C')),        -- coverage class
  segment text,                         -- e.g. "ANCHOR","BATTLEGROUND","ENTRY"
  bags_per_month integer default 0,
  last_visit_at timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index stores_region_idx on public.stores(region);
create index stores_territory_idx on public.stores(created_by);
create index stores_location_idx on public.stores using gist (
  ll_to_earth(lat, lng)
) where lat is not null and lng is not null;

alter table public.stores enable row level security;

-- TSR sees stores in their territory (created_by = themselves OR assigned)
create policy "TSR sees own territory stores"
  on public.stores for select
  using (
    created_by = auth.uid() or
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
      and u.role in ('dsm','rsm','admin')
    )
  );
create policy "TSR can insert stores"
  on public.stores for insert
  with check (created_by = auth.uid());
create policy "TSR can update own stores"
  on public.stores for update
  using (created_by = auth.uid());
```

### 3.3 Store Products
```sql
create table public.store_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  brand text not null,                  -- e.g. "VIEPro Premium Hog"
  product_group text not null check (product_group in ('hog','poultry','gamefowl','aqua','pet','dairy','other')),
  bags_per_month integer default 0,
  is_vienovo boolean default false,     -- true = our brand, false = competitor
  created_at timestamptz default now()
);

create index store_products_store_idx on public.store_products(store_id);
alter table public.store_products enable row level security;
create policy "Inherit store access for products"
  on public.store_products for all
  using (
    exists (
      select 1 from public.stores s
      where s.id = store_id
    )
  );
```

### 3.4 Store Competitors
```sql
create table public.store_competitors (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  brand_name text not null,             -- e.g. "B-MEG", "Vitarich", "Pilmico"
  product_group text,
  est_bags_per_month integer default 0,
  notes text,
  created_at timestamptz default now()
);

create index store_competitors_store_idx on public.store_competitors(store_id);
alter table public.store_competitors enable row level security;
create policy "Inherit store access for competitors"
  on public.store_competitors for all
  using (
    exists (
      select 1 from public.stores s
      where s.id = store_id
    )
  );
```

### 3.5 Visits
```sql
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  tsr_id uuid not null references public.users(id),
  visit_type text not null check (visit_type in ('mapping','regular','order','merch','farm')),
  lat double precision,                 -- GPS at time of visit
  lng double precision,
  photo_url text,
  notes text,
  order_taken boolean default false,
  order_amount numeric(12,2) default 0,
  merch_score integer check (merch_score between 0 and 5),
  duration_mins integer,
  offline_id text unique,               -- client-generated ID for offline sync dedup
  visited_at timestamptz default now(),
  synced_at timestamptz default now()
);

create index visits_tsr_idx on public.visits(tsr_id);
create index visits_store_idx on public.visits(store_id);
create index visits_date_idx on public.visits(visited_at desc);

alter table public.visits enable row level security;
create policy "TSR sees own visits"
  on public.visits for select
  using (
    tsr_id = auth.uid() or
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
      and u.role in ('dsm','rsm','admin')
    )
  );
create policy "TSR can insert own visits"
  on public.visits for insert
  with check (tsr_id = auth.uid());
```

### 3.6 Seed Data (Test Users)
```sql
-- Insert 3 test users (PIN = 1234 for all, bcrypt hash)
-- In production, generate real hashes via Edge Function
-- For testing use plain text — replace with hash before go-live

insert into public.users (phone, pin_hash, name, role, region, district, territory) values
('09170000001', '1234', 'Rico Abante',       'tsr',   'Luzon', 'Metro Manila', 'MM-North'),
('09170000002', '1234', 'Jake Santos',        'tsr',   'Luzon', 'Metro Manila', 'MM-South'),
('09170000003', '1234', 'Jefrey Florentino',  'dsm',   'Luzon', 'Metro Manila', null),
('09170000099', '1234', 'Admin User',         'admin', null,    null,           null);
```

---

## 4. SUPABASE EDGE FUNCTIONS

### 4.1 PIN Authentication: `verify-pin`
Location: `supabase/functions/verify-pin/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  const { phone, pin } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Look up user by phone
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone.trim())
    .eq('is_active', true)
    .single()

  if (error || !user) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    })
  }

  // In production: compare bcrypt hash
  // For v1: plain text comparison (replace with bcrypt before go-live)
  if (user.pin_hash !== pin) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    })
  }

  // Return user profile (no JWT — session managed client-side)
  return new Response(JSON.stringify({
    id: user.id,
    name: user.name,
    role: user.role,
    region: user.region,
    district: user.district,
    territory: user.territory
  }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
})
```

**Deploy:**
```bash
supabase functions deploy verify-pin
```

---

## 5. FRONTEND MODULES TO BUILD

The existing `prototype.html` stays as the base. Break it into modular JS files:

```
/
├── index.html              (entry — login screen)
├── app.html                (main app shell — redirect here after login)
├── config.js               (Supabase URL + anon key)
├── js/
│   ├── auth.js             (login, session, logout)
│   ├── supabase.js         (Supabase client init)
│   ├── db.js               (all Supabase queries — stores, visits, users)
│   ├── offline.js          (Dexie.js IndexedDB queue + sync)
│   ├── gps.js              (navigator.geolocation wrapper)
│   ├── camera.js           (photo capture + Supabase Storage upload)
│   ├── stores.js           (store list, filter, render)
│   ├── visit-wizard.js     (wizard steps + submit)
│   ├── map.js              (Leaflet map + markers from live data)
│   └── admin.js            (admin panel — user management)
├── admin.html              (Sales Admin panel — separate page)
└── sw.js                   (Service Worker — offline PWA)
```

---

## 6. MODULE SPECS

### 6.1 `auth.js`
```javascript
// Session stored in localStorage as:
// { id, name, role, region, district, territory, loggedInAt }

async function login(phone, pin) { ... }      // calls verify-pin Edge Function
function getSession() { ... }                  // returns parsed session or null
function requireAuth() { ... }                 // redirect to index.html if no session
function logout() { ... }                      // clear session, redirect
function hasRole(roles) { ... }               // e.g. hasRole(['dsm','rsm','admin'])
```

### 6.2 `db.js` — Core Queries
```javascript
// STORES
async function getStores(filters = {}) { ... }
  // filters: { territory, region, health_status, search }
  // TSR: auto-filter by session.id as created_by
  // DSM+: filter by district

async function createStore(storeData) { ... }
async function updateStore(id, data) { ... }
async function getStoreById(id) { ... }       // includes products + competitors

// STORE PRODUCTS
async function upsertStoreProducts(storeId, products) { ... }
async function upsertStoreCompetitors(storeId, competitors) { ... }

// VISITS
async function createVisit(visitData) { ... }
async function getVisitsByStore(storeId) { ... }
async function getVisitsByTSR(tsrId, dateFrom) { ... }
async function getDSMSummary(district, dateFrom) { ... }

// USERS (admin only)
async function getUsers() { ... }
async function createUser(userData) { ... }
async function updateUser(id, data) { ... }   // reset PIN, deactivate
```

### 6.3 `offline.js` — Offline Queue
```javascript
// Uses Dexie.js for IndexedDB

const db = new Dexie('PatrolOffline')
db.version(1).stores({
  pendingVisits: '++id, offline_id, created_at',
  pendingStores: '++id, offline_id, created_at',
  cachedStores:  'id, updated_at'
})

async function queueVisit(visitData) { ... }   // save to IndexedDB
async function queueStore(storeData) { ... }
async function syncPending() { ... }            // push queue to Supabase
function getSyncStatus() { ... }               // returns { pending: n, synced: n }
async function cacheStores(stores) { ... }     // cache for offline viewing
async function getCachedStores() { ... }
```

### 6.4 `gps.js`
```javascript
async function getCurrentPosition(options = {}) { ... }
  // Returns { lat, lng, accuracy } or null
  // options: { timeout: 10000, enableHighAccuracy: true }

function formatCoords(lat, lng) { ... }       // "14.6900, 121.0900"
function getGoogleMapsLink(lat, lng) { ... }  // deep link for verification
```

### 6.5 `camera.js`
```javascript
async function capturePhoto() { ... }
  // Opens camera input (mobile) or file picker (desktop)
  // Returns compressed base64 blob

async function uploadPhoto(blob, path) { ... }
  // Uploads to Supabase Storage: patrol-photos/{tsr_id}/{date}/{filename}
  // Returns public URL

function compressImage(file, maxWidth = 1200, quality = 0.75) { ... }
  // Compress before upload — critical for mobile data limits
```

### 6.6 `visit-wizard.js` — Updated Submit
```javascript
// Replace prototype's mock submit with:
async function submitVisit(wizardData) {
  const session = getSession()
  const gps = await getCurrentPosition()

  // 1. Upload photo if captured
  let photoUrl = null
  if (wizardData.photo) {
    photoUrl = await uploadPhoto(wizardData.photo, `${session.id}/${Date.now()}`)
  }

  const visitPayload = {
    store_id:      wizardData.storeId,
    tsr_id:        session.id,
    visit_type:    wizardData.type,
    lat:           gps?.lat,
    lng:           gps?.lng,
    photo_url:     photoUrl,
    notes:         wizardData.notes,
    order_taken:   wizardData.orderTaken,
    order_amount:  wizardData.orderAmount,
    merch_score:   wizardData.merchScore,
    offline_id:    `${session.id}_${Date.now()}`,
    visited_at:    new Date().toISOString()
  }

  if (navigator.onLine) {
    return await createVisit(visitPayload)
  } else {
    await queueVisit(visitPayload)       // offline queue
    return { queued: true }
  }
}
```

---

## 7. ADMIN PANEL (`admin.html`)

Separate page, role-gated to `admin` only.

**Features:**
- User list table (name, phone, role, territory, active status)
- Add new TSR form (name, phone, PIN, role, region, district, territory)
- Edit TSR (reset PIN, change territory, activate/deactivate)
- Export to CSV button
- Summary stats: total users, active today, stores mapped, visits this week

**Supabase query for admin dashboard:**
```sql
select
  u.role,
  count(distinct u.id) as users,
  count(distinct s.id) as stores_mapped,
  count(distinct v.id) filter (where v.visited_at > now() - interval '7 days') as visits_7d
from public.users u
left join public.stores s on s.created_by = u.id
left join public.visits v on v.tsr_id = u.id
where u.role = 'tsr'
group by u.role;
```

---

## 8. PWA SETUP

### 8.1 `manifest.json`
```json
{
  "name": "VieForce Patrol",
  "short_name": "Patrol",
  "description": "Vienovo Philippines Field CRM",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#004D71",
  "theme_color": "#004D71",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 8.2 `sw.js` — Service Worker
```javascript
// Cache strategy:
// - App shell (HTML/CSS/JS): Cache First
// - API calls (Supabase): Network First, fallback to cached
// - Photos: Network Only (too large to cache)

const CACHE = 'patrol-v1'
const SHELL = ['/', '/app.html', '/config.js', '/js/auth.js', ...]

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(SHELL))
))

self.addEventListener('fetch', e => {
  if (e.request.url.includes('supabase.co')) {
    // Network first for API
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)))
  } else {
    // Cache first for app shell
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)))
  }
})
```

---

## 9. SUPABASE STORAGE SETUP

```
Bucket name: patrol-photos
Public: false (use signed URLs)
File size limit: 5MB
Allowed types: image/jpeg, image/png, image/webp

Folder structure:
  patrol-photos/
    {tsr_id}/
      {YYYY-MM-DD}/
        {timestamp}_{store_id}.jpg
```

**RLS Policy for Storage:**
```sql
-- TSR can upload to own folder
create policy "TSR upload own photos"
on storage.objects for insert
with check (
  bucket_id = 'patrol-photos' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- TSR can read own photos; managers can read all
create policy "Read patrol photos"
on storage.objects for select
using (
  bucket_id = 'patrol-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text or
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
      and u.role in ('dsm','rsm','admin')
    )
  )
);
```

---

## 10. SYNC STATUS UI

Add a persistent sync indicator to the app header:

```html
<!-- In top-bar -->
<div id="sync-status" class="sync-indicator">
  <span id="sync-dot"></span>
  <span id="sync-label">Synced</span>
</div>
```

```javascript
// States:
// online + no queue  → green dot  "Synced"
// online + queue > 0 → blue dot   "Syncing..."
// offline            → orange dot "Offline · 3 pending"

function updateSyncUI() {
  const { pending } = getSyncStatus()
  const online = navigator.onLine
  // update dot color + label
}

window.addEventListener('online', () => { syncPending(); updateSyncUI() })
window.addEventListener('offline', updateSyncUI)
```

---

## 11. BUILD ORDER (Claude Code execution sequence)

Execute in this exact order. Do not skip steps.

```
Phase 1 — Foundation (do first)
  [ ] 1. Create /config.js with Supabase placeholders
  [ ] 2. Create /js/supabase.js — init Supabase client
  [ ] 3. Run SQL schema (Sections 3.1–3.6) in Supabase dashboard
  [ ] 4. Create /js/auth.js — login, session, requireAuth
  [ ] 5. Update login screen in prototype to call auth.js
  [ ] 6. Deploy verify-pin Edge Function
  [ ] 7. Test login with seed user 09170000001 / PIN 1234

Phase 2 — Store Mapping (core TSR feature)
  [ ] 8.  Create /js/gps.js
  [ ] 9.  Create /js/camera.js
  [ ] 10. Create /js/db.js — stores queries
  [ ] 11. Replace prototype's hardcoded stores[] with live getStores() call
  [ ] 12. Wire "New Store" form to createStore() + GPS capture
  [ ] 13. Add photo capture to store creation form
  [ ] 14. Test: TSR creates store → appears in Supabase table

Phase 3 — Visit Wizard
  [ ] 15. Create /js/visit-wizard.js
  [ ] 16. Create /js/offline.js (Dexie.js)
  [ ] 17. Wire wizard submit to submitVisit()
  [ ] 18. Add sync status indicator to header
  [ ] 19. Test: submit visit online → in DB. Turn off wifi → submit → queue → turn on → auto-sync

Phase 4 — Live Map
  [ ] 20. Update /js/map.js to load markers from getStores()
  [ ] 21. Color-code pins by health_status from DB
  [ ] 22. Popup shows live data (bags, last visit, segment)

Phase 5 — DSM Dashboard
  [ ] 23. Wire DSM dashboard KPIs to getDSMSummary()
  [ ] 24. Wire visit chart to real visit data by week
  [ ] 25. Add territory filter (by TSR under this DSM)

Phase 6 — Admin Panel
  [ ] 26. Build /admin.html
  [ ] 27. Create /js/admin.js — user CRUD
  [ ] 28. Add PIN reset functionality
  [ ] 29. Export to CSV

Phase 7 — PWA
  [ ] 30. Create /manifest.json
  [ ] 31. Create /sw.js
  [ ] 32. Register service worker in index.html
  [ ] 33. Generate icons (192px + 512px)
  [ ] 34. Test "Add to Home Screen" on Android Chrome

Phase 8 — Hardening
  [ ] 35. Replace plain-text PIN with bcrypt hash in Edge Function
  [ ] 36. Add input validation + error messages (in Tagalog for TSR-facing)
  [ ] 37. Rate limiting on verify-pin Edge Function
  [ ] 38. Test with 5 pilot TSRs — fix UX issues
  [ ] 39. Full 200 TSR rollout
```

---

## 12. KEY DECISIONS & CONSTRAINTS

| Decision | Choice | Reason |
|---|---|---|
| Auth method | PIN managed by Sales Admin | No SMS cost, no Google account needed, 200 non-technical users |
| PIN security | bcrypt hash (Phase 8) | Plain text for v1 speed, hashed before go-live |
| Framework | Vanilla JS (no React) | Keep prototype intact, TSR devices may be low-end Android |
| Offline strategy | Dexie.js queue | TSRs in rural areas frequently lose signal |
| Photo compression | Client-side before upload | Save mobile data, stay within Supabase free tier |
| File structure | Multi-file (not single HTML) | Maintainable, Claude Code can edit individual files |
| RLS | Per-role row-level security | TSR only sees own territory, DSM sees district |
| Image URLs | Supabase signed URLs (not public) | Photo privacy, prevent data leaks |

---

## 13. SUPABASE PROJECT SETUP CHECKLIST

Before Claude Code starts, the human (Mat) must:

```
[ ] 1. Create Supabase project at supabase.com (free tier)
[ ] 2. Copy Project URL → paste into config.js
[ ] 3. Copy Anon Key → paste into config.js
[ ] 4. Copy Service Role Key → add to Edge Function secrets
[ ] 5. Run SQL schema (Section 3) in Supabase SQL Editor
[ ] 6. Create Storage bucket "patrol-photos" (private)
[ ] 7. Apply Storage RLS policies (Section 9)
[ ] 8. Deploy verify-pin Edge Function (Section 4.1)
[ ] 9. Confirm seed users inserted (Section 3.6)
[ ] 10. Test Edge Function: curl -X POST .../verify-pin -d '{"phone":"09170000001","pin":"1234"}'
```

---

## 14. ENVIRONMENT & REPO STRUCTURE

```
vieforce-patrol/
├── CLAUDE.md                   ← this file (project brief for Claude Code)
├── config.js                   ← Supabase keys (git-ignored in prod)
├── .env                        ← Vercel env vars
├── .gitignore
├── vercel.json
├── index.html                  ← Login screen
├── app.html                    ← Main app (existing prototype, modularized)
├── admin.html                  ← Admin panel
├── manifest.json               ← PWA manifest
├── sw.js                       ← Service worker
├── js/
│   ├── supabase.js
│   ├── auth.js
│   ├── db.js
│   ├── offline.js
│   ├── gps.js
│   ├── camera.js
│   ├── stores.js
│   ├── visit-wizard.js
│   ├── map.js
│   └── admin.js
├── css/
│   └── patrol.css              ← Extract styles from prototype
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── supabase/
    ├── schema.sql              ← Full DB schema (Section 3)
    └── functions/
        └── verify-pin/
            └── index.ts        ← Edge Function (Section 4.1)
```

---

## 15. NOTES FOR CLAUDE CODE

- **Preserve the existing UI/UX exactly.** The prototype design is approved and TSR-tested. Do not redesign screens.
- **Vienovo brand colors:** Navy `#004D71`, Blue `#00A6CE`, Green `#95C93D`, Gold `#F1B11D`
- **Language:** UI text in English. Error messages for TSRs can include Filipino/Tagalog equivalents.
- **TSR devices:** Assume low-end Android (4GB RAM, slow CPU). Keep JS lean. Avoid heavy libraries.
- **Photo upload:** Always compress before upload. Max 1200px wide, 75% JPEG quality.
- **GPS:** Always show accuracy radius. If accuracy > 100m, warn TSR to move to open area.
- **Offline first:** Every write operation must work offline. Assume intermittent connectivity.
- **Admin PIN management:** Sales Admin creates all users. TSRs cannot self-register.
- **Do not use Supabase's built-in Auth UI** — we use custom PIN via Edge Function only.

---

*Document version: 1.0 · April 2026 · Vienovo Philippines Inc.*
*Prepared for Claude Code (VS Code extension) project initialization*
