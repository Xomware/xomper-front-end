import { Component, OnInit } from '@angular/core'
import { NgIf, NgFor, NgClass, DatePipe } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { environment } from 'src/environments/environment'

interface Claimant {
  userId: string
  email: string
  linkedAt: string
}

interface ClaimedAccount {
  sleeperUserId: string
  sleeperUsername: string
  claimCount: number
  isContested: boolean
  claimants: Claimant[]
}

interface ClaimsResponse {
  totalUsers: number
  unlinkedUsers: number
  linkedAccounts: number
  contestedAccounts: number
  accounts: ClaimedAccount[]
}

/**
 * Who has claimed which Sleeper account.
 *
 * Linking is unverified: Sleeper has no OAuth, and the only publicly readable
 * field that could prove ownership is `display_name`, so verifying would mean
 * sending every new user into another app to rename themselves mid-signup.
 * Any account can claim any handle, and more than one can claim the same one.
 *
 * Users are never told about a collision — nothing in the app surfaces it.
 * This page is the only place it is visible, so that when profiles start
 * carrying identity (friends, comments) we already know whether it is
 * actually happening.
 */
@Component({
  selector: 'app-admin-sleeper-claims',
  standalone: true,
  imports: [NgIf, NgFor, NgClass, DatePipe],
  templateUrl: './admin-sleeper-claims.component.html',
  styleUrls: ['./admin-sleeper-claims.component.scss'],
})
export class AdminSleeperClaimsComponent implements OnInit {
  loading = true
  error: string | null = null
  data: ClaimsResponse | null = null

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.load()
  }

  load(): void {
    this.loading = true
    this.error = null

    this.http
      .get<ClaimsResponse>(
        `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev/admin/sleeper-claims`,
      )
      .subscribe({
        next: (data) => {
          this.data = data
          this.loading = false
        },
        error: (err) => {
          this.error = err?.status === 401 ? 'Not authorized.' : 'Failed to load claims.'
          this.loading = false
        },
      })
  }

  sleeperUrl(username: string): string {
    return `https://sleeper.com/user/${username}`
  }
}
