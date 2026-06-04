import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'

/**
 * Admin Logs placeholder.
 *
 * Static empty-state card: terminal icon + "CloudWatch logs coming soon".
 * No fetch logic, no store. Matches D-D deferral from the s7 plan.
 */
@Component({
  selector: 'app-admin-logs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-logs.component.html',
  styleUrls: ['./admin-logs.component.scss'],
})
export class AdminLogsComponent {}
