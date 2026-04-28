#!/usr/bin/env node
/**
 * Read-only Supabase Auth config check (Management API GET).
 * Validates site_url and uri_allow_list against Patrol expectations before release.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_ACCESS_TOKEN = "<PAT from https://supabase.com/dashboard/account/tokens>"
 *   npm run check:supabase-auth
 *
 * Optional env:
 *   SUPABASE_PROJECT_REF   (default: yolxcmeoovztuindrglk)
 *   PATROL_SITE_URL        (default: https://vieforce-patrol.vercel.app)
 *   PATROL_URI_SUBSTRINGS  comma-separated strings that must appear in uri_allow_list (default: vieforce-patrol.vercel.app,localhost)
 */
const API = 'https://api.supabase.com';
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'yolxcmeoovztuindrglk';
const EXPECT_SITE =
  (process.env.PATROL_SITE_URL || 'https://vieforce-patrol.vercel.app').replace(/\/$/, '');
const MUST_CONTAIN = String(
  process.env.PATROL_URI_SUBSTRINGS ||
    'vieforce-patrol.vercel.app,localhost'
)
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token || !String(token).trim()) {
  console.error(
    'Missing SUPABASE_ACCESS_TOKEN.\n' +
      'Create a Personal Access Token: https://supabase.com/dashboard/account/tokens\n' +
      'Then: $env:SUPABASE_ACCESS_TOKEN = "sbp_..." ; npm run check:supabase-auth'
  );
  process.exit(1);
}

const url = `${API}/v1/projects/${PROJECT_REF}/config/auth`;
const res = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` },
});

const text = await res.text();
if (!res.ok) {
  console.error('GET auth config failed', res.status, text.slice(0, 800));
  process.exit(1);
}

let cfg;
try {
  cfg = JSON.parse(text);
} catch {
  console.error('Non-JSON response', text.slice(0, 500));
  process.exit(1);
}

const siteUrl = String(cfg.site_url || '').replace(/\/$/, '');
const allowList = String(cfg.uri_allow_list || '');
const allowLower = allowList.toLowerCase();

console.log('Project:', PROJECT_REF);
console.log('site_url:', siteUrl || '(empty)');
console.log('uri_allow_list:', allowList || '(empty)');

let exit = 0;
if (siteUrl !== EXPECT_SITE) {
  console.warn(
    `[WARN] site_url mismatch: expected "${EXPECT_SITE}", got "${siteUrl || '(empty)'}"`
  );
  exit = 1;
} else {
  console.log('[OK] site_url matches PATROL_SITE_URL');
}

for (const sub of MUST_CONTAIN) {
  if (!allowLower.includes(sub)) {
    console.warn(
      `[WARN] uri_allow_list should include pattern containing "${sub}" (Supabase Dashboard → Auth → URL Configuration)`
    );
    exit = 1;
  }
}
if (exit === 0) {
  console.log('[OK] uri_allow_list contains required substrings');
}

process.exit(exit);
