#!/usr/bin/env node
// VieForce Patrol — UAT seed
// 2026-05-26 · run with `node scripts/seed-uat.mjs` (or `--teardown`)
//
// Seeds 1 RSM + 2 DSM + 4 TSR + 80 stores (20 per TSR) + 20 farms (5 per TSR)
// + ~320 visits (4 per store, last 14 days, realistic outcome mix) into the
// live Supabase project, tagged for one-shot teardown.
//
// Tag strategy (everything is forward-deletable):
//   users   — phone numbers in 09170000100..130 range
//   stores  — name starts with "[UAT] "
//   farms   — name starts with "[UAT] "
//   visits  — derived from UAT stores (cascade by store_id)
//   org     — uses unique "[UAT] " name prefix on region/district/territory
//
// Usage:
//   node scripts/seed-uat.mjs              ← seed (idempotent — re-runnable)
//   node scripts/seed-uat.mjs --teardown   ← delete everything tagged [UAT]
//   node scripts/seed-uat.mjs --verify     ← just print row counts
//
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env. Pull via:
//   npx vercel env pull

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ── env loader (parses .env.local if present) ──────────────────
function loadEnv() {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Run `npx vercel env pull` to populate .env.local from Vercel.');
  process.exit(1);
}

// ── PostgREST client (matches api/_lib/supabase-service.js pattern) ──
const REST = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function rest(method, path, body, extraHeaders) {
  const url = `${REST}${path}`;
  const res = await fetch(url, {
    method,
    headers: { ...HEADERS, ...(extraHeaders || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = (data && (data.message || data.error || JSON.stringify(data))) || text;
    throw new Error(`${method} ${path} → ${res.status}: ${detail}`);
  }
  return data;
}

// upsert helpers — use Prefer: resolution=merge-duplicates with on_conflict column
async function upsert(table, rows, onConflictCol) {
  if (!rows.length) return [];
  return rest('POST', `/${table}?on_conflict=${onConflictCol}`, rows, {
    Prefer: 'return=representation,resolution=merge-duplicates',
  });
}
async function insertBatch(table, rows) {
  if (!rows.length) return [];
  return rest('POST', `/${table}`, rows);
}
async function selectWhere(table, filter, columns) {
  const q = columns ? `select=${columns}` : 'select=*';
  return rest('GET', `/${table}?${q}&${filter}`);
}
async function deleteWhere(table, filter) {
  return rest('DELETE', `/${table}?${filter}`, null, { Prefer: 'return=representation' });
}

// ── Personas (the 7) ───────────────────────────────────────────
const PERSONAS = [
  // RSM
  { phone: '09170000100', name: 'Carlos Reyes',       role: 'rsm',  region: 'NCR', district: null,                  territory: null,             email: 'carlos.reyes.uat@vienovo.ph' },
  // DSMs
  { phone: '09170000110', name: 'Jake Santos',        role: 'dsm',  region: 'NCR', district: 'Caloocan-Bulacan',    territory: null,             email: 'jake.santos.uat@vienovo.ph' },
  { phone: '09170000111', name: 'Maria Cruz',         role: 'dsm',  region: 'NCR', district: 'Valenzuela-Quezon',   territory: null,             email: 'maria.cruz.uat@vienovo.ph' },
  // TSRs
  { phone: '09170000120', name: 'Ben Tolentino',      role: 'tsr',  region: 'NCR', district: 'Caloocan-Bulacan',    territory: 'Caloocan-North', email: null },
  { phone: '09170000121', name: 'Junjun Garcia',      role: 'tsr',  region: 'NCR', district: 'Caloocan-Bulacan',    territory: 'Bulacan-South',  email: null },
  { phone: '09170000122', name: 'Aileen Villanueva',  role: 'tsr',  region: 'NCR', district: 'Valenzuela-Quezon',   territory: 'Valenzuela-East', email: null },
  { phone: '09170000123', name: 'Manny dela Cruz',    role: 'tsr',  region: 'NCR', district: 'Valenzuela-Quezon',   territory: 'Quezon-West',    email: null },
];
const UAT_PINS = '1234';

// ── territory bounding boxes (real-ish PH metro lat/lng) ────────
const TERRITORY_BOXES = {
  'Caloocan-North':  { city: 'Caloocan',   province: 'Metro Manila', latMin: 14.72, latMax: 14.78, lngMin: 120.96, lngMax: 121.02 },
  'Bulacan-South':   { city: 'Meycauayan', province: 'Bulacan',      latMin: 14.72, latMax: 14.78, lngMin: 120.95, lngMax: 121.03 },
  'Valenzuela-East': { city: 'Valenzuela', province: 'Metro Manila', latMin: 14.68, latMax: 14.73, lngMin: 120.96, lngMax: 121.04 },
  'Quezon-West':     { city: 'Quezon City', province: 'Metro Manila', latMin: 14.62, latMax: 14.68, lngMin: 121.02, lngMax: 121.08 },
};

const STORE_NAMES_POOL = [
  'Aling Nene Feeds', 'Manong Dado Agri', 'Golden Egg Supply', 'Bukid Pro Center',
  'Tatay Boyet Feed Store', 'Sunrise Poultry Trading', 'Sampaguita Farm Supplies',
  'Mabuhay Feeds Outlet', 'Calbayog Agri Mart', 'Roxas Livestock Co',
  'Pinagkaisa Feed Trading', 'Jollibee Farm Store', 'Kabayan Poultry Hub',
  'Lola Trinidad Agri', 'Three Sisters Feed Shop', 'Patrocinio Agri Supply',
  'Don Carlo Feeds', 'Bagong Pagasa Trading', 'Sta. Cruz Animal Feeds',
  'Bagumbayan Agri Center', 'Maharlika Feeds', 'San Roque Poultry',
  'Pag-asa Livestock Mart', 'Mayon Farm Supplies', 'Pinatubo Agri Trading',
];

const STORE_TYPES = ['feeds_dealer', 'farm_supply', 'pet_shop', 'veterinary', 'supermarket'];
const STORE_SEGMENTS = ['Hog', 'Poultry', 'Gamefowl', 'Mixed', 'Layer', 'Broiler'];
const VOL_CLASSES = ['A', 'B', 'C'];
const COV_CLASSES = ['A', 'B', 'C'];
const HEALTH_STATUSES = ['ok', 'ok', 'ok', 'warn', 'crit']; // weighted
const FARM_TYPES = ['hog', 'poultry', 'gamefowl', 'aqua', 'dairy', 'mixed'];

// Visit outcomes — realistic mix: 60% with order, 30% no order, 10% return visit
const OUTCOME_BUCKETS = [
  { weight: 60, visit_type: 'order',   order_taken: true,  noteTpl: 'Nag-order. {bags} bags ViePro {seg}.' },
  { weight: 30, visit_type: 'regular', order_taken: false, noteTpl: 'Nakausap, pero walang order ngayon. Susunod na linggo, sabi.' },
  { weight: 10, visit_type: 'regular', order_taken: false, noteTpl: 'Bukas ulit balik. Wala si owner.' },
];
function pickOutcome() {
  const r = Math.random() * 100;
  let acc = 0;
  for (const b of OUTCOME_BUCKETS) {
    acc += b.weight;
    if (r < acc) return b;
  }
  return OUTCOME_BUCKETS[OUTCOME_BUCKETS.length - 1];
}

// ── deterministic-ish rng for plausible store coords ───────────
function rand(min, max) { return Math.random() * (max - min) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickFloat(min, max, digits) { return Number(rand(min, max).toFixed(digits)); }

// ── TEARDOWN ───────────────────────────────────────────────────
async function teardown() {
  console.log('\n[UAT] Teardown — deleting all rows tagged [UAT] / phone 09170000100-130');
  // Visits don't have a name; cascade by store_id IN (uat stores)
  const uatStores = await selectWhere('stores', 'name=like.%5BUAT%5D%25', 'id');
  const uatStoreIds = uatStores.map(s => s.id);
  if (uatStoreIds.length) {
    const ids = uatStoreIds.map(id => `"${id}"`).join(',');
    const delV = await deleteWhere('visits', `store_id=in.(${ids})`);
    console.log(`  visits deleted: ${delV?.length ?? 0}`);
  } else {
    console.log('  visits: 0 (no UAT stores found)');
  }
  const delS = await deleteWhere('stores', 'name=like.%5BUAT%5D%25');
  console.log(`  stores deleted: ${delS?.length ?? 0}`);
  const delF = await deleteWhere('farms', 'name=like.%5BUAT%5D%25');
  console.log(`  farms deleted: ${delF?.length ?? 0}`);
  const delU = await deleteWhere('users', 'phone=in.(09170000100,09170000110,09170000111,09170000120,09170000121,09170000122,09170000123)');
  console.log(`  users deleted: ${delU?.length ?? 0}`);
  console.log('[UAT] Teardown complete.\n');
}

// ── VERIFY ─────────────────────────────────────────────────────
async function verify() {
  const u = await selectWhere('users', 'phone=in.(09170000100,09170000110,09170000111,09170000120,09170000121,09170000122,09170000123)', 'id,name,role,phone');
  const s = await selectWhere('stores', 'name=like.%5BUAT%5D%25', 'id');
  const f = await selectWhere('farms', 'name=like.%5BUAT%5D%25', 'id');
  const storeIds = s.map(x => `"${x.id}"`).join(',');
  let v = [];
  if (storeIds) v = await selectWhere('visits', `store_id=in.(${storeIds})&select=id&limit=10000`, 'id');
  console.log('\n[UAT] Verify — current row counts:');
  console.log(`  users (7 expected): ${u.length}`);
  for (const usr of u) console.log(`    · ${usr.role.padEnd(4)} ${usr.name} (${usr.phone})`);
  console.log(`  stores (80 expected): ${s.length}`);
  console.log(`  farms (20 expected): ${f.length}`);
  console.log(`  visits (~320 expected): ${v.length}`);
  console.log('');
}

// ── SEED ───────────────────────────────────────────────────────
async function seed() {
  console.log('[UAT] Seeding…');

  // 1. Personas (idempotent by phone)
  console.log('  · users (7)');
  const userRows = PERSONAS.map(p => ({
    phone: p.phone,
    pin_hash: UAT_PINS,
    name: p.name,
    role: p.role,
    region: p.region,
    district: p.district,
    territory: p.territory,
    email: p.email,
    is_active: true,
    language: 'tl',
  }));
  const insertedUsers = await upsert('users', userRows, 'phone');
  const usersByPhone = Object.fromEntries(insertedUsers.map(u => [u.phone, u]));

  // RSM + DSM linkage (manager_id)
  const rsm = usersByPhone['09170000100'];
  const dsm1 = usersByPhone['09170000110'];
  const dsm2 = usersByPhone['09170000111'];
  // Link DSMs → RSM
  await rest('PATCH', `/users?phone=in.(09170000110,09170000111)`, { manager_id: rsm.id });
  // Link TSRs → DSM
  await rest('PATCH', `/users?phone=in.(09170000120,09170000121)`, { manager_id: dsm1.id });
  await rest('PATCH', `/users?phone=in.(09170000122,09170000123)`, { manager_id: dsm2.id });

  const tsrs = [
    usersByPhone['09170000120'],
    usersByPhone['09170000121'],
    usersByPhone['09170000122'],
    usersByPhone['09170000123'],
  ];

  // 2. Stores (20 per TSR, deterministic name suffix for re-runnability)
  console.log('  · stores (80)');
  // First wipe existing UAT stores so visit-count math stays stable on re-run
  await deleteWhere('stores', 'name=like.%5BUAT%5D%25');
  const storeRows = [];
  for (const tsr of tsrs) {
    const box = TERRITORY_BOXES[tsr.territory];
    for (let i = 1; i <= 20; i++) {
      const baseName = pick(STORE_NAMES_POOL);
      const code = `${tsr.territory.split('-')[0].slice(0, 3).toUpperCase()}-${String(i).padStart(2, '0')}`;
      storeRows.push({
        name: `[UAT] ${baseName} — ${code}`,
        owner_name: `${pick(['Aling', 'Manong', 'Tatay', 'Lola', 'Nanay'])} ${pick(['Linda', 'Boyet', 'Cely', 'Rey', 'Marites', 'Junior'])}`,
        phone: `0917${String(Math.floor(Math.random() * 9000000) + 1000000)}`,
        address: `${Math.floor(rand(1, 999))} ${pick(['Bayan', 'Maharlika', 'Sampaguita', 'Mabini', 'Rizal'])} St`,
        city: box.city,
        province: box.province,
        region: tsr.region,
        district: tsr.district,
        store_type: pick(STORE_TYPES),
        lat: pickFloat(box.latMin, box.latMax, 6),
        lng: pickFloat(box.lngMin, box.lngMax, 6),
        health_status: pick(HEALTH_STATUSES),
        vol_class: pick(VOL_CLASSES),
        cov_class: pick(COV_CLASSES),
        segment: pick(STORE_SEGMENTS),
        bags_per_month: Math.floor(rand(30, 200)),
        created_by: tsr.id,
        assigned_tsr: tsr.id,
      });
    }
  }
  const insertedStores = await insertBatch('stores', storeRows);
  console.log(`    ✓ ${insertedStores.length} stores inserted`);

  // 3. Farms (5 per TSR)
  console.log('  · farms (20)');
  await deleteWhere('farms', 'name=like.%5BUAT%5D%25');
  const farmRows = [];
  for (const tsr of tsrs) {
    const box = TERRITORY_BOXES[tsr.territory];
    for (let i = 1; i <= 5; i++) {
      farmRows.push({
        // Live farms columns: id, name, type, location, size, share, segment,
        // heads, lat, lng, photo_url, assigned_tsr, created_by, created_at,
        // updated_at, breed, feed_partner, vet_support, owner_name, phone, region
        name: `[UAT] Bukid ni ${pick(['Mang Pedro', 'Aling Nita', 'Tatay Ben', 'Nanay Rose', 'Manong Caloy'])} ${i}`,
        type: pick(FARM_TYPES),
        owner_name: `${pick(['Pedro', 'Nita', 'Ben', 'Rose', 'Caloy'])} ${pick(['Aquino', 'Bautista', 'Cortez', 'Dela Cruz'])}`,
        phone: `0917${String(Math.floor(Math.random() * 9000000) + 1000000)}`,
        location: `Brgy ${pick(['San Jose', 'San Roque', 'San Antonio', 'Sta Maria'])}, ${box.city}, ${box.province}`,
        region: tsr.region,
        lat: pickFloat(box.latMin, box.latMax, 6),
        lng: pickFloat(box.lngMin, box.lngMax, 6),
        heads: Math.floor(rand(50, 5000)),
        size: pickFloat(0.5, 8.0, 2),
        share: Math.floor(rand(20, 80)),
        segment: pick(STORE_SEGMENTS),
        breed: pick(['Hybro', 'Cobb 500', 'Ross 308', 'Native', 'Hipro', 'Landrace']),
        feed_partner: pick(['Vienovo', 'Vienovo', 'Vienovo', 'Pilmico', 'San Miguel', 'B-Meg']),
        vet_support: pick(['regular', 'occasional', 'none']),
        created_by: tsr.id,
        assigned_tsr: tsr.id,
      });
    }
  }
  const insertedFarms = await insertBatch('farms', farmRows);
  console.log(`    ✓ ${insertedFarms.length} farms inserted`);

  // 4. Visits — 3-5 per store over last 14 days
  // Stagger TSR productivity for an interesting leaderboard:
  //   Ben:    avg 4.5/store (high performer, leaderboard #1)
  //   Junjun: avg 3.8/store (solid)
  //   Aileen: avg 4.2/store
  //   Manny:  avg 3.0/store (lower — needs DSM attention)
  console.log('  · visits (target ~320)');
  const visitProfile = {
    [tsrs[0].id]: 4.5,
    [tsrs[1].id]: 3.8,
    [tsrs[2].id]: 4.2,
    [tsrs[3].id]: 3.0,
  };
  const visitRows = [];
  const now = Date.now();
  for (const store of insertedStores) {
    const avgPerStore = visitProfile[store.created_by] || 4;
    const n = Math.max(1, Math.round(avgPerStore + (Math.random() - 0.5) * 2));
    for (let i = 0; i < n; i++) {
      const out = pickOutcome();
      const daysAgo = Math.random() * 14;
      const visitedAt = new Date(now - daysAgo * 24 * 3600 * 1000).toISOString();
      const seg = store.segment || 'Hog';
      const bags = out.order_taken ? Math.floor(rand(5, 80)) : 0;
      visitRows.push({
        store_id: store.id,
        tsr_id: store.created_by,
        visit_type: out.visit_type,
        lat: store.lat,
        lng: store.lng,
        photo_url: null,
        notes: out.noteTpl.replace('{bags}', bags).replace('{seg}', seg),
        order_taken: out.order_taken,
        order_amount: bags * 1500, // ₱1500/bag rough
        duration_mins: Math.floor(rand(8, 30)),
        offline_id: `uat_${store.id}_${i}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        visited_at: visitedAt,
        synced_at: visitedAt,
      });
    }
  }
  // Insert in batches of 100 (PostgREST payload limits)
  let inserted = 0;
  for (let i = 0; i < visitRows.length; i += 100) {
    const batch = visitRows.slice(i, i + 100);
    const r = await insertBatch('visits', batch);
    inserted += r.length;
  }
  console.log(`    ✓ ${inserted} visits inserted`);

  // 5. Update stores.last_visit_at from the visits we just inserted
  console.log('  · backfill stores.last_visit_at');
  // Group by store_id and find max visited_at; do this client-side
  const lastByStore = {};
  for (const v of visitRows) {
    const prev = lastByStore[v.store_id];
    if (!prev || v.visited_at > prev) lastByStore[v.store_id] = v.visited_at;
  }
  for (const [storeId, ts] of Object.entries(lastByStore)) {
    await rest('PATCH', `/stores?id=eq.${storeId}`, { last_visit_at: ts });
  }
  console.log(`    ✓ ${Object.keys(lastByStore).length} stores backfilled`);

  console.log('\n[UAT] Seed complete.');
  await verify();
}

// ── entry point ────────────────────────────────────────────────
(async () => {
  try {
    if (process.argv.includes('--teardown')) {
      await teardown();
    } else if (process.argv.includes('--verify')) {
      await verify();
    } else {
      await seed();
    }
  } catch (e) {
    console.error('\n[UAT] Error:', e.message);
    process.exit(1);
  }
})();
