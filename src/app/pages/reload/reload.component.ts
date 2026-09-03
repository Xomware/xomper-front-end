import { Component } from '@angular/core'

/**
 * Renders nothing, on purpose.
 *
 * Switching leagues remounts the current page by navigating away and back.
 * That bounce used to go through '/', which is the signed-out welcome page --
 * so every league switch flashed the marketing hero for about 300ms and read
 * as being logged out.
 *
 * This is the same bounce with nothing to paint.
 */
@Component({
  selector: 'app-reload',
  standalone: true,
  template: '',
})
export class ReloadComponent {}
