import { Component, Input, Output, EventEmitter } from '@angular/core'
import { CommonModule } from '@angular/common'

export interface ConfirmDialogConfig {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** When true the confirm button renders in a destructive red style. */
  destructive?: boolean
}

/**
 * Shared confirm dialog for destructive actions.
 * Consumer toggles [visible], listens to (confirmed) emitting true/false.
 *
 * Usage:
 *   <app-confirm-dialog
 *     [config]="dialogConfig"
 *     [visible]="showDialog"
 *     (confirmed)="onConfirm($event)"
 *   />
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.scss'],
})
export class ConfirmDialogComponent {
  @Input() config: ConfirmDialogConfig = { title: 'Confirm', message: '' }
  @Input() visible = false
  @Output() confirmed = new EventEmitter<boolean>()

  confirm(): void {
    this.confirmed.emit(true)
  }

  cancel(): void {
    this.confirmed.emit(false)
  }
}
