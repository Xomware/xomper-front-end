/**
 * Sidebar entry data table — mirrors iOS TrayDestination order.
 * Update route targets here as later stubs (s3–s9) build each destination.
 * Admin entries are filtered by ShellLayoutComponent based on SupabaseService.isAdmin.
 */

export interface SidebarEntry {
  label: string
  /** Icon glyph (emoji or icon name placeholder — swap in s10 for proper icon system). */
  icon: string
  route: string
  queryParams?: Record<string, string>
  /** True for entries only visible to admins. */
  adminOnly?: boolean
  /** TODO marker for entries that need a real route in a future stub. */
  placeholder?: boolean
}

export interface SidebarSection {
  title: string
  entries: SidebarEntry[]
  /** True for sections only visible to admins. */
  adminOnly?: boolean
}

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    title: 'Play',
    entries: [
      {
        label: 'Home',
        icon: '🏠',
        route: '/home',
      },
      {
        label: 'Standings',
        icon: '🏆',
        route: '/league',
        // s3 splits to /league/standings
      },
      {
        label: 'Matchups',
        icon: '⚔️',
        route: '/league',
        queryParams: { tab: 'matchups' },
        // s3 splits to /league/matchups
      },
      {
        label: 'Playoffs',
        icon: '🎯',
        route: '/league',
        queryParams: { tab: 'playoffs' },
        // s3 splits
      },
      {
        label: 'Draft History',
        icon: '📋',
        route: '/draft-history',
        // s4 restructures
      },
      {
        label: 'World Cup',
        icon: '🌍',
        route: '/league',
        queryParams: { tab: 'worldcup' },
        // s3 splits
      },
    ],
  },
  {
    title: 'Team',
    entries: [
      {
        label: 'My Team',
        icon: '👥',
        route: '/team',
      },
      {
        label: 'Taxi Squad',
        icon: '🚕',
        route: '/taxi-squad',
      },
      {
        label: 'Team Analyzer',
        icon: '📊',
        route: '/team', // TODO(s8): replace with /team-analyzer once component is built
        placeholder: true,
      },
    ],
  },
  {
    title: 'League',
    entries: [
      {
        label: 'Rulebook',
        icon: '📖',
        route: '/league',
        queryParams: { tab: 'rules' },
        // s3 splits
      },
      {
        label: 'Scoring',
        icon: '⚡',
        route: '/league',
        queryParams: { tab: 'rules' },
        // s3 splits
      },
      {
        label: 'League Settings',
        icon: '⚙️',
        route: '/league',
        queryParams: { tab: 'rules' },
        // s3 splits
      },
      {
        label: 'Payouts',
        icon: '💰',
        route: '/league',
        queryParams: { tab: 'rules' },
        // s3 splits
      },
      {
        label: 'Rule Proposals',
        icon: '🗳️',
        route: '/league',
        queryParams: { tab: 'rules' },
        // s3 splits
      },
      {
        label: 'Draft Order',
        icon: '🎲',
        route: '/league',
        queryParams: { tab: 'rules' },
        // TODO(s9): builds the component
        placeholder: true,
      },
    ],
  },
  {
    title: 'Admin',
    adminOnly: true,
    entries: [
      {
        label: 'AI Review',
        icon: '🤖',
        route: '/ai-review',
        adminOnly: true,
        placeholder: true, // TODO(s6): builds the component
      },
      {
        label: 'Admin',
        icon: '🔧',
        route: '/admin',
        adminOnly: true,
        placeholder: true, // TODO(s7): builds the component
      },
    ],
  },
]
