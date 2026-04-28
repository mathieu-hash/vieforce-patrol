// Supabase Client — PKCE OAuth needs explicit flow; we exchange ?code= in auth.js on index load.
var supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    flowType: 'pkce',
    detectSessionInUrl: false
  }
});
