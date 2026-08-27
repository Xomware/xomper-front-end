// Environment for visual regression tests ONLY. Never deployed.
//
// The committed environment.ts carries '---' placeholders and the real values
// are injected at deploy time from SSM, so the app cannot boot from it
// locally. Structurally valid dummies here get past Amplify.configure() and
// let pages render; requests fail, which is fine and deterministic for
// screenshots.
export const environment = {
  production: true,
  appName: 'Xomper',
  appEyebrow: 'Fantasy football, measured',
  appTagline: 'Fantasy football analysis for every league you are in.',
  poweredByXomper: false,
  secondaryCta: { label: 'Look up a league', route: '/search' },
  baseCallbackUrl: 'https://xomper.xomware.com',
  apiId: '---',
  // Structurally valid so Amplify.configure() does not throw during the
  // visual run; no request is ever made against them.
  awsRegion: 'us-east-1',
  cognitoUserPoolId: 'us-east-1_visualtest',
  cognitoClientId: 'visualtestsplaceholderclientid',
  cognitoDomain: 'visual-tests.invalid',
  // Default league (transitional — removed in Phase 4 with the follow table).
  // 2026 season id. The 2025 id 1181789700187090944 is status=complete;
  // Sleeper mints a new league id each season.
  myLeagueId: '1317249551823814656',
  myLeagueName: 'CLT DYNASTY',
}
