import { Directive, Input, OnInit, TemplateRef, ViewContainerRef } from '@angular/core'
import { FeatureFlagsService } from '../services/feature-flags.service'

/**
 * Structural directive that renders its host when the given boolean matches
 * the FeatureFlagsService.newShellEnabled flag.
 *
 * Usage:
 *   <ng-container *xomperNewShell="false">legacy chrome</ng-container>
 *   <ng-container *xomperNewShell="true">new shell</ng-container>
 *
 * Deleted post-s5 default flip.
 */
@Directive({
  selector: '[xomperNewShell]',
  standalone: true,
})
export class XomperNewShellDirective implements OnInit {
  @Input('xomperNewShell') showWhenEnabled = true

  constructor(
    private templateRef: TemplateRef<unknown>,
    private viewContainer: ViewContainerRef,
    private featureFlags: FeatureFlagsService,
  ) {}

  ngOnInit(): void {
    const shouldRender =
      this.showWhenEnabled === this.featureFlags.newShellEnabled

    if (shouldRender) {
      this.viewContainer.createEmbeddedView(this.templateRef)
    } else {
      this.viewContainer.clear()
    }
  }
}
