import { Component } from '@angular/core'

@Component({
  selector: 'app-payouts',
  templateUrl: './payouts.component.html',
  styleUrls: ['./payouts.component.scss'],
  standalone: true,
  imports: [],
})
export class PayoutsComponent {
  readonly content = `<strong>A. Dues</strong> &mdash; $100 per season.<br><br><strong>B. Payout Structure:</strong><br><table class="rules-table"><tr><th>Award</th><th>Payout</th></tr><tr><td>Champion</td><td>$600</td></tr><tr><td>2nd Place</td><td>$200</td></tr><tr><td>3rd Place</td><td>$80</td></tr><tr><td>4th Place</td><td>$80</td></tr><tr><td>Highest Weekly Score (x14)</td><td>$10 each</td></tr><tr><td>World Cup Winner (every 4 yrs)</td><td>$400</td></tr></table><br>MVP awards for positional leaders (player must have been started that week to count).`
}
