import { Injectable } from '@angular/core'

const STORAGE_KEY = 'xomperNewShell'

@Injectable({
  providedIn: 'root',
})
export class FeatureFlagsService {
  private readonly _newShellEnabled: boolean

  constructor() {
    const params = new URLSearchParams(window.location.search)
    if (params.get('newShell') === '1') {
      try {
        localStorage.setItem(STORAGE_KEY, '1')
      } catch {
        // localStorage unavailable (private browsing, quota exceeded) — ignore
      }
      this._newShellEnabled = true
    } else {
      let stored = false
      try {
        stored = localStorage.getItem(STORAGE_KEY) === '1'
      } catch {
        // localStorage unavailable — ignore
      }
      this._newShellEnabled = stored
    }
  }

  get newShellEnabled(): boolean {
    return this._newShellEnabled
  }
}
