import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts"

// --- CORS --- allow all origins (public login endpoint)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function getCorsHeaders(_req: Request) {
  return corsHeaders
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

    // --- /hash-pin admin endpoint ---
    if (body.action === 'hash' && body.pin) {
      // Require service_role key
      const authHeader = req.headers.get('authorization') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      if (!authHeader.includes(serviceKey)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized — service_role key required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const pinToHash = validatePin(body.pin)
      if (!pinToHash) {
        return new Response(
          JSON.stringify({ error: 'PIN must be 4-6 digits' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const hash = await bcrypt.hash(pinToHash)
      return new Response(
        JSON.stringify({ hash }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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
      .select('id,name,role,region,district,territory,pin_hash,is_active')
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

    // PIN verification: try bcrypt first, then plain-text fallback for migration
    let pinMatch = false
    try {
      pinMatch = await bcrypt.compare(pin, user.pin_hash)
    } catch (_) {
      // bcrypt.compare throws if pin_hash is not a valid bcrypt string
      // Fall through to plain-text comparison for seed/migration users
    }

    // Plain-text fallback (for seed users until PINs are rehashed)
    if (!pinMatch && user.pin_hash === pin) {
      pinMatch = true
    }

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
      territory: user.territory
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
