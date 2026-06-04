import { Component, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ActivatedRoute, Router } from '@angular/router'
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms'
import { TablesService } from 'src/app/services/tables.service'
import { WhitelistedUser } from 'src/app/models/whitelisted-user.model'
import { AdminFieldValue } from 'src/app/models/admin-field-value.model'
import { ADMIN_EMAIL_REGEX } from 'src/app/models/admin-validation'

/** Custom validator mirroring iOS AdminValidation.isValidEmail */
function adminEmailValidator(control: AbstractControl): ValidationErrors | null {
  const v = (control.value as string | null) ?? ''
  if (!v.trim()) return null  // required validator handles empty
  return ADMIN_EMAIL_REGEX.test(v.trim()) ? null : { adminEmail: true }
}

@Component({
  selector: 'app-admin-user-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-user-edit.component.html',
  styleUrls: ['./admin-user-edit.component.scss'],
})
export class AdminUserEditComponent implements OnInit {
  form!: FormGroup
  user: WhitelistedUser | null = null
  isLoading = false
  isSaving = false
  error: string | null = null
  successMessage: string | null = null

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private tablesService: TablesService,
  ) {}

  ngOnInit(): void {
    this.buildForm()
    const id = this.route.snapshot.paramMap.get('id')
    if (id) this.loadUser(id)
  }

  private buildForm(): void {
    this.form = this.fb.group({
      email:       ['', [Validators.required, adminEmailValidator]],
      displayName: [''],
      isAdmin:     [false],
      isActive:    [false],
    })
  }

  private loadUser(id: string): void {
    this.isLoading = true
    this.tablesService.listUsers().subscribe({
      next: (users) => {
        this.isLoading = false
        const found = users.find((u) => u.id === id) ?? null
        if (!found) {
          this.error = 'User not found.'
          return
        }
        this.user = found
        this.form.patchValue({
          email:       found.email,
          displayName: found.displayName ?? '',
          isAdmin:     found.isAdmin,
          isActive:    found.isActive,
        })
      },
      error: (err: unknown) => {
        this.isLoading = false
        this.error = err instanceof Error ? err.message : 'Failed to load user.'
      },
    })
  }

  submit(): void {
    if (this.form.invalid || this.isSaving || !this.user) return
    this.error = null
    this.successMessage = null

    const diff = this.buildDiff()
    if (Object.keys(diff).length === 0) {
      this.successMessage = 'No changes detected.'
      return
    }

    this.isSaving = true
    // updateKey is the user's email — the backend's lookup key.
    this.tablesService.updateUser(this.user.email, diff).subscribe({
      next: () => {
        this.isSaving = false
        this.successMessage = 'Saved.'
        // Patch local user to reflect the diff so re-saves are accurate.
        const v = this.form.value as { email: string; displayName: string; isAdmin: boolean; isActive: boolean }
        this.user = {
          ...this.user!,
          email: v.email.trim(),
          displayName: v.displayName.trim() || null,
          isAdmin: v.isAdmin,
          isActive: v.isActive,
        }
      },
      error: (err: unknown) => {
        this.isSaving = false
        this.error = err instanceof Error ? err.message : 'Save failed.'
      },
    })
  }

  private buildDiff(): Record<string, AdminFieldValue> {
    const orig = this.user!
    const v = this.form.value as {
      email: string
      displayName: string
      isAdmin: boolean
      isActive: boolean
    }
    const diff: Record<string, AdminFieldValue> = {}

    const emailTrimmed = v.email.trim()
    const displayNameTrimmed = v.displayName.trim()

    if (emailTrimmed !== orig.email)
      diff['email'] = { kind: 'string', value: emailTrimmed }
    if (displayNameTrimmed !== (orig.displayName ?? ''))
      diff['display_name'] = displayNameTrimmed
        ? { kind: 'string', value: displayNameTrimmed }
        : { kind: 'null' }
    if (v.isAdmin !== orig.isAdmin)
      diff['is_admin'] = { kind: 'bool', value: v.isAdmin }
    if (v.isActive !== orig.isActive)
      diff['is_active'] = { kind: 'bool', value: v.isActive }

    return diff
  }

  cancel(): void {
    this.router.navigate(['/admin/tables/users'])
  }

  /** Read-only display: user ID. */
  get userId(): string {
    return this.user?.id ?? '—'
  }

  /** Read-only display: Sleeper user ID. */
  get sleeperUserId(): string {
    return this.user?.sleeperUserId ?? '—'
  }
}
