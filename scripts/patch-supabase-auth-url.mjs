#!/usr/bin/env node
/**
 * One-shot fix: set Supabase Auth Site URL + redirect allow-list via Management API.
 * Stops OAuth from returning to http://localhost:3000/?code=... (connection refused / chrome-error noise).
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_ACCESS_TOKEN = "<personal access token from https://supabase.com/dashboard/account/tokens>"
 *   npm run fix:supabase-auth-url
 *
 * Token needs permissions: auth_config_write (or use a token with project admin).
 */
const API = 'https://api.supabase.com';
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'yolxcmeoovztuindrglk';
// Shared Supabase project with VieForce HQ: site_url must be HQ so HQ Google OAuth redirect_to
// (vieforce-hq.vercel.app) passes IsRedirectURLValid hostname check. Patrol uses explicit redirectTo
// to vieforce-patrol — still allowed via uri_allow_list below.
const SITE_URL = (
  process.env.SUPABASE_AUTH_SITE_URL ||
  process.env.PATROL_SITE_URL ||
  'https://vieforce-hq.vercel.app'
).replace(/\/$/, '');
/** Comma-separated patterns (same as Dashboard "Redirect URLs"). */
/** Include HQ so running this script does not break VieForce HQ Google sign-in (same Supabase project). */
const URI_ALLOW_LIST =
  process.env.PATROL_URI_ALLOW_LIST ||
  'https://vieforce-patrol.vercel.app/**,https://vieforce-hq.vercel.app/**,https://vieforce-hq.vercel.app/index.html,http://localhost:3000/**,http://127.0.0.1:3000/**';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token || !String(token).trim()) {
  console.error(
    'Missing SUPABASE_ACCESS_TOKEN.\n' +
      'Create a Personal Access Token: https://supabase.com/dashboard/account/tokens\n' +
      'Then: $env:SUPABASE_ACCESS_TOKEN = "sbp_..." ; npm run fix:supabase-auth-url'
  );
  process.exit(1);
}

const body = {
  site_url: SITE_URL.replace(/\/$/, ''),
  uri_allow_list: URI_ALLOW_LIST,
};

const url = `${API}/v1/projects/${PROJECT_REF}/config/auth`;
const res = await fetch(url, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const text = await res.text();
if (!res.ok) {
  console.error('PATCH failed', res.status, text);
  process.exit(1);
}
console.log('OK', res.status);
console.log('Updated site_url →', body.site_url);
console.log('Updated uri_allow_list →', body.uri_allow_list);
try {
  const j = JSON.parse(text);
  if (j && j.site_url) console.log('Response site_url:', j.site_url);
} catch (_) {
  console.log(text.slice(0, 500));
}
