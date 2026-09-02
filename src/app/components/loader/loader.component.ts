import {
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
} from '@angular/core'
import { NgIf } from '@angular/common'
import { LoaderCoordinator } from './loader-coordinator.service'

@Component({
  selector: 'app-loader',
  templateUrl: './loader.component.html',
  styleUrls: ['./loader.component.scss'],
  standalone: true,
  imports: [NgIf],
})
export class LoaderComponent implements OnChanges, OnDestroy {
  @Input() loading = false

  /** What is being waited on. Generic by default; pages can be specific. */
  @Input() message = 'Loading'

  /** Identity for the coordinator. Every instance is its own claimant. */
  private readonly token = {}

  private holding = false

  constructor(
    private coordinator: LoaderCoordinator,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(): void {
    if (this.loading && !this.holding) {
      this.holding = true
      this.coordinator.claim(this.token)
      return
    }
    if (!this.loading && this.holding) {
      this.holding = false
      // Deferred so a page handing off to its child route does not blink.
      this.coordinator.releaseSoon(this.token, () => this.cdr.markForCheck())
    }
  }

  ngOnDestroy(): void {
    this.coordinator.release(this.token)
  }

  /**
   * Painting is the coordinator's call, not this input's.
   *
   * A page nested inside another that is also loading stays silent rather
   * than stacking a second full-screen overlay on the first.
   */
  get visible(): boolean {
    return this.coordinator.anyActive && this.coordinator.isPrimary(this.token)
  }
}
