import { Injectable } from '@angular/core'

const STORAGE_KEY = 'xomperNewShell'

/**
 * s5 DEFAULT FLIP: newShell now defaults to TRUE.
 * Rollback: ?newShell=0  OR  localStorage.setItem('xomperNewShell', '0')
 * The gate scaffolding (*xomperNewShell directive, query-param + localStorage
 * overrides) stays in place for ~14 days post-merge so a one-PR follow-up
 * can rip it out cleanly once the new shell has soaked in production.
 * Follow-up cleanup tracked in: web-ios-parity epic / s5 EXECUTION_LOG.md
 */
@Injectable({
  providedIn: 'root',
})
export class FeatureFlagsService {
  private readonly _newShellEnabled: boolean

  constructor() {
    const params = new URLSearchParams(window.location.search)
    const qp = params.get('newShell')

    if (qp === '0') {
      // Explicit opt-out via query param — write to storage so subsequent
      // navigations (without ?newShell) stay opted out in this session.
      try {
        localStorage.setItem(STORAGE_KEY, '0')
      } catch {
        // localStorage unavailable — ignore
      }
      this._newShellEnabled = false
    } else if (qp === '1') {
      // Explicit opt-in — also persist (no-op now that default is true,
      // but keeps backward compatibility with existing bookmarks).
      try {
        localStorage.setItem(STORAGE_KEY, '1')
      } catch {
        // localStorage unavailable — ignore
      }
      this._newShellEnabled = true
    } else {
      // No query param — check localStorage for an explicit opt-out.
      let storedOptOut = false
      try {
        storedOptOut = localStorage.getItem(STORAGE_KEY) === '0'
      } catch {
        // localStorage unavailable — ignore
      }
      // Default is TRUE; only disabled when explicitly opted out.
      this._newShellEnabled = !storedOptOut
    }
  }

  get newShellEnabled(): boolean {
    return this._newShellEnabled
  }
}
