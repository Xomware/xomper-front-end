/**
 * Sidebar entry data table — mirrors iOS TrayDestination order.
 * s3: all 9 league destinations now point at flat child routes under /league/...
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
        route: '/league/standings',
      },
      {
        label: 'Matchups',
        icon: '⚔️',
        route: '/league/matchups',
      },
      {
        label: 'Playoffs',
        icon: '🎯',
        route: '/league/playoffs',
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
        route: '/league/world-cup',
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
        route: '/team-analyzer',
      },
    ],
  },
  {
    title: 'League',
    entries: [
      {
        label: 'Rulebook',
        icon: '📖',
        route: '/league/rulebook',
      },
      {
        label: 'Scoring',
        icon: '⚡',
        route: '/league/scoring',
      },
      {
        label: 'League Settings',
        icon: '⚙️',
        route: '/league/settings',
      },
      {
        label: 'Payouts',
        icon: '💰',
        route: '/league/payouts',
      },
      {
        label: 'Rule Proposals',
        icon: '🗳️',
        route: '/league/rule-proposals',
      },
      {
        label: 'Draft Order',
        icon: '🎲',
        route: '/league/draft-order',
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
      },
      {
        label: 'Admin',
        icon: '🔧',
        route: '/admin',
        adminOnly: true,
      },
    ],
  },
]
