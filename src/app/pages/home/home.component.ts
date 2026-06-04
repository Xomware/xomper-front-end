import { Component } from '@angular/core'
import { LandingComponent } from '../landing/landing.component'

/**
 * Home route host — thin wrapper over LandingComponent.
 * Auth gating is handled by AuthGuard on the /home route.
 * All fetch logic lives in the individual card components.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [LandingComponent],
  template: '<app-landing></app-landing>',
  styles: [],
})
export class HomeComponent {}
