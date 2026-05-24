// supabase/functions/verify-pin/index.ts
//
// Wave 1 (W1-AuthCore): TSR PIN login now issues a real Supabase Auth session.
//
// Flow:
//   1. Validate phone + PIN, rate-limit, plaintext compare against users.pin_hash
//      (PIN hashing deferred to W1-PinHash agent in a separate wave per Mat).
//   2. Find-or-create a Supabase Auth user keyed off `phone` via the admin API.
//      Stamp app_metadata with patrol_user_id + role + org fields so server-side
//      RLS can read them via `auth.jwt() -> 'app_metadata' ->> 'role'`.
//   3. Sign an HS256 JWT with the project's SUPABASE_JWT_SECRET so the resulting
//      token is one Supabase Auth recognises (auth.uid() = patrol_user_id).
//      We also sign an opaque refresh token. (Direct admin "issue session" is
//      not in the public supabase-js admin API as of @supabase/supabase-js@2;
//      hand-signing the JWT with the project secret is the documented
//      fallback and is what Mat sketched in the brief.)
//   4. Return { access_token, refresh_token, expires_in, token_type, user }
//      so `js/auth.js` can call `supabase.auth.setSession(...)` directly.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  create as jwtCreate,
  getNumericDate,
  Header,
  Payload,
} from "https://deno.land/x/djwt@v3.0.2/mod.ts";

// --- CORS --- reflective allowlist (match api/_lib/patrol-cors.js) + PATROL_CORS_ORIGINS
const DEFAULT_CORS_ORIGINS = [
  "https://vieforce-patrol.vercel.app",
  "https://patrol.vienovo.ph",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
];

function buildCorsOriginSet(): Set<string> {
  const set = new Set(DEFAULT_CORS_ORIGINS);
  const extra = (Deno.env.get("PATROL_CORS_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const o of extra) set.add(o);
  return set;
}

function getCorsHeaders(req: Request): Record<string, string> {
  const allowed = buildCorsOriginSet();
  const origin = (req.headers.get("Origin") || "").trim();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origin && allowed.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

// --- Rate Limiting (in-memory; W1-Session note: still per-instance, see F-07) ---
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
let requestCounter = 0;

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BRUTE_FORCE_DELAY_MS = 2000;
const BRUTE_FORCE_THRESHOLD = 3;

// Access token TTL (1 hour — matches Supabase default and our auth cache assumptions)
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
// Refresh token TTL (30 days — Supabase default)
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function cleanupOldEntries() {
  const now = Date.now();
  for (const [phone, entry] of loginAttempts) {
    if (now - entry.lastAttempt > RATE_LIMIT_WINDOW_MS) {
      loginAttempts.delete(phone);
    }
  }
}

function isRateLimited(phone: string): boolean {
  const entry = loginAttempts.get(phone);
  if (!entry) return false;
  if (Date.now() - entry.lastAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.delete(phone);
    return false;
  }
  return entry.count >= RATE_LIMIT_MAX;
}

function recordAttempt(phone: string) {
  const entry = loginAttempts.get(phone);
  const now = Date.now();
  if (entry && now - entry.lastAttempt < RATE_LIMIT_WINDOW_MS) {
    entry.count++;
    entry.lastAttempt = now;
  } else {
    loginAttempts.set(phone, { count: 1, lastAttempt: now });
  }
}

function getAttemptCount(phone: string): number {
  return loginAttempts.get(phone)?.count ?? 0;
}

function resetAttempts(phone: string) {
  loginAttempts.delete(phone);
}

// --- Input Validation ---
function sanitizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return null;
  return digits;
}

function validatePin(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const pin = raw.trim();
  if (!/^\d{4,6}$/.test(pin)) return null;
  return pin;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- JWT signing (HS256 with the Supabase project JWT secret) ------------------
// SUPABASE_JWT_SECRET is set automatically on every Supabase Edge Function
// runtime — it's the same secret the GoTrue auth server uses to sign tokens,
// which is why a token we sign with it is recognised by `auth.uid()` and the
// PostgREST RLS engine.
let _jwtCryptoKey: CryptoKey | null = null;
async function getJwtCryptoKey(): Promise<CryptoKey> {
  if (_jwtCryptoKey) return _jwtCryptoKey;
  const secret = Deno.env.get("SUPABASE_JWT_SECRET");
  if (!secret) {
    throw new Error(
      "SUPABASE_JWT_SECRET missing on Edge Function — cannot sign session JWT",
    );
  }
  _jwtCryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return _jwtCryptoKey;
}

async function signSession(authUserId: string, patrolUser: PatrolUserRow) {
  const key = await getJwtCryptoKey();
  const header: Header = { alg: "HS256", typ: "JWT" };

  const appMetadata = {
    provider: "phone",
    providers: ["phone"],
    patrol_user_id: patrolUser.id,
    role: patrolUser.role,
    name: patrolUser.name,
    region: patrolUser.region,
    district: patrolUser.district,
    territory: patrolUser.territory,
  };
  const userMetadata = {
    name: patrolUser.name,
    language: patrolUser.language ?? "en",
    is_champion: !!patrolUser.is_champion,
  };

  // Access token
  const accessPayload: Payload = {
    sub: authUserId,
    aud: "authenticated",
    role: "authenticated",
    iss: "patrol-verify-pin",
    iat: getNumericDate(0),
    exp: getNumericDate(ACCESS_TOKEN_TTL_SECONDS),
    email: patrolUser.email ?? undefined,
    phone: patrolUser.phone ?? undefined,
    app_metadata: appMetadata,
    user_metadata: userMetadata,
    session_id: crypto.randomUUID(),
  };
  const access_token = await jwtCreate(header, accessPayload, key);

  // Refresh token: opaque-ish JWT pointing back to the same auth user.
  // (Supabase-js will store and submit it back to GoTrue; refresh round-trips
  // through GoTrue's /token endpoint will re-issue tokens off the same auth.users
  // row we created/located above, so this stays in sync with Supabase's own
  // refresh machinery.)
  const refreshPayload: Payload = {
    sub: authUserId,
    iss: "patrol-verify-pin",
    iat: getNumericDate(0),
    exp: getNumericDate(REFRESH_TOKEN_TTL_SECONDS),
    type: "refresh",
    session_id: accessPayload.session_id,
  };
  const refresh_token = await jwtCreate(header, refreshPayload, key);

  return { access_token, refresh_token };
}

// --- Supabase Auth user find-or-create -----------------------------------------
interface PatrolUserRow {
  id: string;
  name: string;
  role: string;
  region: string | null;
  district: string | null;
  territory: string | null;
  phone: string;
  email: string | null;
  is_champion: boolean | null;
  pin_hash: string;
  is_active: boolean;
  language: string | null;
}

/**
 * Find an existing auth.users row whose phone matches the Patrol user, or
 * create one. Stamps app_metadata with the Patrol user id + role + org fields
 * so RLS policies can read them via auth.jwt() ->> 'role'.
 *
 * Returns the auth user id (uuid). This is what we use as `sub` in the signed
 * JWT so that `auth.uid()` resolves to that id on the DB side.
 *
 * IMPORTANT: we use the SAME UUID as the Patrol users.id so RLS policies like
 * `auth.uid() = users.id` work without a join. This requires creating the auth
 * user with an explicit `id` — supported by supabase.auth.admin.createUser
 * since v2.7.0.
 */
async function findOrCreateAuthUser(patrolUser: PatrolUserRow): Promise<string> {
  const appMetadata = {
    provider: "phone",
    providers: ["phone"],
    patrol_user_id: patrolUser.id,
    role: patrolUser.role,
    name: patrolUser.name,
    region: patrolUser.region,
    district: patrolUser.district,
    territory: patrolUser.territory,
  };

  // Probe by id first — fastest path, and our target state is auth.id === users.id.
  // @ts-ignore: getUserById exists on admin client (supabase-js v2)
  const probe = await supabase.auth.admin.getUserById(patrolUser.id);
  if (probe.data && probe.data.user) {
    // Refresh app_metadata in case role / org changed since last login.
    await supabase.auth.admin.updateUserById(patrolUser.id, {
      app_metadata: appMetadata,
      user_metadata: {
        name: patrolUser.name,
        language: patrolUser.language ?? "en",
        is_champion: !!patrolUser.is_champion,
      },
      phone: patrolUser.phone,
    });
    return patrolUser.id;
  }

  // Not present — create with explicit id matching Patrol users.id.
  const created = await supabase.auth.admin.createUser({
    id: patrolUser.id,
    phone: patrolUser.phone,
    phone_confirm: true,
    email: patrolUser.email || undefined,
    email_confirm: !!patrolUser.email,
    app_metadata: appMetadata,
    user_metadata: {
      name: patrolUser.name,
      language: patrolUser.language ?? "en",
      is_champion: !!patrolUser.is_champion,
    },
  });
  if (created.error) {
    // W1.3 hotfix 2026-05-24: createUser commonly fails for two reasons:
    //   (a) another concurrent login created the row first (race)
    //   (b) the patrol user's email is ALREADY in auth.users from a prior
    //       Google OAuth — in that case the existing auth.users.id is
    //       Google-derived and !== patrol_user.id. We do NOT try to
    //       force the IDs to match (auth.users.id is immutable post-
    //       creation); instead we accept the existing row, stamp its
    //       app_metadata with patrol_user_id, and return its id. The
    //       JWT we sign will use THAT id as `sub`, and RLS policies
    //       must read patrol_user_id from app_metadata rather than
    //       relying on auth.uid() = users.id.
    //
    // Lookup order: by email, then by phone (managers may lack phone;
    // TSRs may lack email).
    const lookup = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const users = lookup?.data?.users ?? [];
    const byEmail = patrolUser.email
      ? users.find?.((u: any) =>
          String(u.email || "").toLowerCase() ===
            String(patrolUser.email).toLowerCase()
        )
      : null;
    const byPhone = users.find?.((u: any) => {
      const p = String(u.phone || "").replace(/\D/g, "");
      return p && p === patrolUser.phone;
    });
    const match = byEmail || byPhone;
    if (match?.id) {
      // Refresh app_metadata on the existing row so RLS / claims work.
      await supabase.auth.admin.updateUserById(match.id, {
        app_metadata: appMetadata,
        user_metadata: {
          name: patrolUser.name,
          language: patrolUser.language ?? "en",
          is_champion: !!patrolUser.is_champion,
        },
      });
      return match.id;
    }
    throw new Error(
      "auth.admin.createUser failed: " + (created.error.message || "unknown"),
    );
  }
  return created.data.user.id;
}

// --- Main handler --------------------------------------------------------------
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  requestCounter++;
  if (requestCounter % 100 === 0) cleanupOldEntries();

  try {
    const body = await req.json();
    const { phone: rawPhone, pin: rawPin } = body;

    if (!rawPhone || !rawPin) {
      return new Response(
        JSON.stringify({ error: "Phone and PIN required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const phone = sanitizePhone(String(rawPhone));
    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number — must be 10-13 digits" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const pin = validatePin(String(rawPin));
    if (!pin) {
      return new Response(
        JSON.stringify({ error: "Invalid PIN — must be 4-6 digits" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (isRateLimited(phone)) {
      return new Response(
        JSON.stringify({ error: "Too many attempts. Try again in 15 minutes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: user, error } = await supabase
      .from("users")
      .select(
        "id,name,role,region,district,territory,phone,email,is_champion,pin_hash,is_active,language",
      )
      .eq("phone", phone)
      .eq("is_active", true)
      .single();

    if (error || !user) {
      recordAttempt(phone);
      if (getAttemptCount(phone) >= BRUTE_FORCE_THRESHOLD) {
        console.log(
          `[WARN] ${new Date().toISOString()} | Failed login attempt #${getAttemptCount(phone)} for phone ${phone}`,
        );
        await delay(BRUTE_FORCE_DELAY_MS);
      }
      return new Response(
        JSON.stringify({ error: "Invalid credentials" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Plaintext PIN compare — W1-PinHash agent will migrate to argon2 in a
    // follow-up commit per MASTER_PLAN.md §3 (Wave 1, W1-PinHash row).
    const pinMatch = user.pin_hash === pin;
    if (!pinMatch) {
      recordAttempt(phone);
      const attempts = getAttemptCount(phone);
      if (attempts >= BRUTE_FORCE_THRESHOLD) {
        console.log(
          `[WARN] ${new Date().toISOString()} | Failed login attempt #${attempts} for phone ${phone}`,
        );
        await delay(BRUTE_FORCE_DELAY_MS);
      }
      return new Response(
        JSON.stringify({ error: "Invalid credentials" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    resetAttempts(phone);

    // Find-or-create the Supabase Auth user + sign a session JWT.
    let authUserId: string;
    try {
      authUserId = await findOrCreateAuthUser(user as PatrolUserRow);
    } catch (e) {
      console.log(
        `[ERROR] ${new Date().toISOString()} | findOrCreateAuthUser failed: ${e}`,
      );
      return new Response(
        JSON.stringify({ error: "Auth provisioning failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let tokens: { access_token: string; refresh_token: string };
    try {
      tokens = await signSession(authUserId, user as PatrolUserRow);
    } catch (e) {
      console.log(
        `[ERROR] ${new Date().toISOString()} | signSession failed: ${e}`,
      );
      return new Response(
        JSON.stringify({ error: "Session signing failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        // Supabase session shape — client passes this straight into setSession().
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: "bearer",
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        // Patrol-side identity (kept for backwards-compat with createSessionFromUser).
        id: user.id,
        name: user.name,
        role: user.role,
        region: user.region,
        district: user.district,
        territory: user.territory,
        phone: user.phone,
        email: user.email,
        is_champion: user.is_champion,
        language: user.language ?? "en",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.log(
      `[ERROR] ${new Date().toISOString()} | verify-pin server error: ${err}`,
    );
    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
