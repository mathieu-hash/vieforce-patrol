import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// --- CORS --- reflective allowlist (match api/_lib/patrol-cors.js) + PATROL_CORS_ORIGINS
const DEFAULT_CORS_ORIGINS = [
  'https://vieforce-patrol.vercel.app',
  'https://patrol.vienovo.ph',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
]

function buildCorsOriginSet(): Set<string> {
  const set = new Set(DEFAULT_CORS_ORIGINS)
  const extra = (Deno.env.get('PATROL_CORS_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const o of extra) set.add(o)
  return set
}

function getCorsHeaders(req: Request): Record<string, string> {
  const allowed = buildCorsOriginSet()
  const origin = (req.headers.get('Origin') || '').trim()
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  if (origin && allowed.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Vary'] = 'Origin'
  }
  return headers
}

// --- Rate Limiting (in-memory) ---
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>()
let requestCounter = 0

const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const BRUTE_FORCE_DELAY_MS = 2000
const BRUTE_FORCE_THRESHOLD = 3

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

function cleanupOldEntries() {
  const now = Date.now()
  for (const [phone, entry] of loginAttempts) {
    if (now - entry.lastAttempt > RATE_LIMIT_WINDOW_MS) {
      loginAttempts.delete(phone)
    }
  }
}

function isRateLimited(phone: string): boolean {
  const entry = loginAttempts.get(phone)
  if (!entry) return false
  if (Date.now() - entry.lastAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.delete(phone)
    return false
  }
  return entry.count >= RATE_LIMIT_MAX
}

function recordAttempt(phone: string) {
  const entry = loginAttempts.get(phone)
  const now = Date.now()
  if (entry && now - entry.lastAttempt < RATE_LIMIT_WINDOW_MS) {
    entry.count++
    entry.lastAttempt = now
  } else {
    loginAttempts.set(phone, { count: 1, lastAttempt: now })
  }
}

function getAttemptCount(phone: string): number {
  return loginAttempts.get(phone)?.count ?? 0
}

function resetAttempts(phone: string) {
  loginAttempts.delete(phone)
}

// --- Input Validation ---
function sanitizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 13) return null
  return digits
}

function validatePin(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const pin = raw.trim()
  if (!/^\d{4,6}$/.test(pin)) return null
  return pin
}

// --- Delay helper ---
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// --- Main handler ---
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Periodic cleanup
  requestCounter++
  if (requestCounter % 100 === 0) {
    cleanupOldEntries()
  }

  try {
    const body = await req.json()

    // --- Normal login flow ---
    const { phone: rawPhone, pin: rawPin } = body

    if (!rawPhone || !rawPin) {
      return new Response(
        JSON.stringify({ error: 'Phone and PIN required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Sanitize inputs
    const phone = sanitizePhone(String(rawPhone))
    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number — must be 10-13 digits' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const pin = validatePin(String(rawPin))
    if (!pin) {
      return new Response(
        JSON.stringify({ error: 'Invalid PIN — must be 4-6 digits' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rate limit check
    if (isRateLimited(phone)) {
      return new Response(
        JSON.stringify({ error: 'Too many attempts. Try again in 15 minutes.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id,name,role,region,district,territory,phone,email,is_champion,pin_hash,is_active,language')
      .eq('phone', phone)
      .eq('is_active', true)
      .single()

    if (error || !user) {
      recordAttempt(phone)
      // Brute force delay
      if (getAttemptCount(phone) >= BRUTE_FORCE_THRESHOLD) {
        console.log(`[WARN] ${new Date().toISOString()} | Failed login attempt #${getAttemptCount(phone)} for phone ${phone}`)
        await delay(BRUTE_FORCE_DELAY_MS)
      }
      return new Response(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Plaintext PIN only (pin_hash column = digits as stored by admin / seeds).
    // Legacy bcrypt values will not match — reset PIN in Sales Admin once.
    const pinMatch = user.pin_hash === pin

    if (!pinMatch) {
      recordAttempt(phone)
      const attempts = getAttemptCount(phone)
      if (attempts >= BRUTE_FORCE_THRESHOLD) {
        console.log(`[WARN] ${new Date().toISOString()} | Failed login attempt #${attempts} for phone ${phone}`)
        await delay(BRUTE_FORCE_DELAY_MS)
      }
      return new Response(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Success — reset rate limit counter
    resetAttempts(phone)

    return new Response(JSON.stringify({
      id: user.id,
      name: user.name,
      role: user.role,
      region: user.region,
      district: user.district,
      territory: user.territory,
      phone: user.phone,
      email: user.email,
      is_champion: user.is_champion,
      language: user.language ?? 'en'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.log(`[ERROR] ${new Date().toISOString()} | verify-pin server error: ${err}`)
    return new Response(
      JSON.stringify({ error: 'Server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
