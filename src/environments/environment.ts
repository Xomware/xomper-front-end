export const environment = {
  production: true,
  appName: 'Xomper',
  appEyebrow: 'Fantasy football, measured',
  appTagline: 'Fantasy football analysis for every league you are in.',
  poweredByXomper: false,
  secondaryCta: { label: 'Look up a league', route: '/search' },
  baseCallbackUrl: 'https://xomper.xomware.com',
  apiId: '---',
  // Cognito on the shared `xomware-users` pool. Neither id is a secret --
  // both ship in this bundle -- but they are injected at deploy time from
  // SSM so a pool or client change never touches application code. Same
  // pattern as xomware-frontend and xomforms-frontend.
  awsRegion: 'us-east-1',
  cognitoUserPoolId: '---',
  cognitoClientId: '---',
  cognitoDomain: 'xomware-auth.auth.us-east-1.amazoncognito.com',
  // Default league (transitional — removed in Phase 4 with the follow table).
  // 2026 season id. The 2025 id 1181789700187090944 is status=complete;
  // Sleeper mints a new league id each season.
  myLeagueId: '1317249551823814656',
  myLeagueName: 'CLT DYNASTY',
}
