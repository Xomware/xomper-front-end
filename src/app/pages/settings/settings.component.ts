import { Component, OnInit } from '@angular/core'
import { NgIf } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { take } from 'rxjs/operators'
import { UserProfileService } from 'src/app/services/user-profile.service'

/** Matches the API's cap so the failure happens before a round trip. */
const DISPLAY_NAME_MAX = 32

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [RouterLink, FormsModule, NgIf],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit {
  readonly maxLength = DISPLAY_NAME_MAX

  displayName = ''
  saving = false
  error = ''
  saved = false

  constructor(private profiles: UserProfileService) {}

  ngOnInit(): void {
    this.displayName = this.profiles.getProfile()?.displayName ?? ''

    // Cold navigation: the guard usually has the profile already, but a
    // direct hit on /settings may not.
    if (!this.displayName) {
      this.profiles.load().pipe(take(1)).subscribe((profile) => {
        this.displayName = profile?.displayName ?? ''
      })
    }
  }

  /** The Sleeper handle, shown as a linked account rather than as identity. */
  get sleeperUsername(): string {
    return this.profiles.getProfile()?.sleeperUsername ?? ''
  }

  save(): void {
    this.error = ''
    this.saved = false

    const name = this.displayName.trim()
    if (!name) {
      this.error = 'Enter a name.'
      return
    }
    if (name.length > DISPLAY_NAME_MAX) {
      this.error = `Keep it to ${DISPLAY_NAME_MAX} characters or fewer.`
      return
    }

    this.saving = true
    this.profiles
      .setDisplayName(name)
      .pipe(take(1))
      .subscribe({
        next: (profile) => {
          this.displayName = profile.displayName
          this.saving = false
          this.saved = true
        },
        error: (err) => {
          this.saving = false
          this.error = err?.error?.error?.message ?? 'Could not save that name.'
        },
      })
  }
}
