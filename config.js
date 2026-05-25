// VieForce Patrol Configuration
const CONFIG = {
  SUPABASE_URL: 'https://yolxcmeoovztuindrglk.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbHhjbWVvb3Z6dHVpbmRyZ2xrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MzAwMjksImV4cCI6MjA5MTEwNjAyOX0.uTXWaYLKjFCQv6MLcwQT6SjjmVum0hBiALvYMyG3OI0',
  APP_NAME: 'VieForce Patrol',
  VERSION: '3.2.0-beta.2',
  /** 'beta' = show tester banner + beta labels. Set to 'stable' for GA. */
  RELEASE_CHANNEL: 'beta',
  /** Sentry DSN for beta-channel error reporting. Empty disables capture. */
  SENTRY_DSN: '',
  DOMAIN: 'patrol.vienovo.ph',
  // Google OAuth return URL must be allowed in Supabase → Authentication → URL Configuration (Redirect URLs).
  // If Supabase "Site URL" is still http://localhost:3000, Auth falls back there and you get ERR_CONNECTION_REFUSED.
  OAUTH_PUBLIC_ORIGIN: 'https://patrol.vienovo.ph',
  /** Pilot / demo surfaces — default false (see js/feature-flags.js). */
  PATROL_FEATURES: {
    socialFeed: false,
    salesVelocityChart: false,
    salesSubModules: false,
    mapaFullMap: false,
    storeSapBadges: false,
    phase4Social: false,
    vetRoiCard: false
  }
};
