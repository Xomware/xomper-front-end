// Environment for visual regression tests ONLY. Never deployed.
//
// The committed environment.ts carries '---' placeholders; the real Supabase
// credentials are injected at deploy time from SSM by deploy-frontend.yml.
// That means the app CANNOT BOOT locally: the Supabase client constructor
// throws "Invalid supabaseUrl" and Angular never renders past the app shell.
//
// A syntactically valid dummy URL is enough to get past the constructor so the
// app boots and pages render. Auth calls fail, which is fine and deterministic
// for screenshots.
export const environment = {
  production: true,
  baseCallbackUrl: 'https://xomper.xomware.com',
  apiAuthToken: '---',
  apiId: '---',
  supabaseUrl: 'https://visual-tests.invalid',
  supabaseAnonKey: 'visual-tests-placeholder',
  // Default league (transitional — removed in Phase 4 with the follow table).
  // 2026 season id. The 2025 id 1181789700187090944 is status=complete;
  // Sleeper mints a new league id each season.
  myLeagueId: '1317249551823814656',
  myLeagueName: 'CLT DYNASTY',
}
