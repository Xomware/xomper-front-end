import { Component, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ActivatedRoute, Router } from '@angular/router'
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
} from '@angular/forms'
import { AnnouncementsService } from 'src/app/services/announcements.service'
import { LeagueAnnouncement, AnnouncementCreateInput } from 'src/app/models/league-announcement.model'
import { AdminFieldValue } from 'src/app/models/admin-field-value.model'

/**
 * Admin announcement edit / create form.
 *
 * Routes:
 *   /admin/announcements/new  — create mode (no :id)
 *   /admin/announcements/:id  — edit mode (diff-on-save)
 *
 * Expiry 3-state:
 *   hasExpiry = false → send expires_at: null (clear any existing expiry)
 *   hasExpiry = true  → send expires_at: ISO string of the chosen datetime
 *   (update only sends the field if it changed vs the original)
 */
@Component({
  selector: 'app-admin-announcement-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-announcement-edit.component.html',
  styleUrls: ['./admin-announcement-edit.component.scss'],
})
export class AdminAnnouncementEditComponent implements OnInit {
  form!: FormGroup
  isNew = true
  isLoading = false
  isSaving = false
  error: string | null = null
  successMessage: string | null = null

  private announcementId: string | null = null
  private original: LeagueAnnouncement | null = null

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private announcementsService: AnnouncementsService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')
    this.isNew = !id || id === 'new'
    this.announcementId = this.isNew ? null : id

    this.buildForm()

    if (!this.isNew && this.announcementId) {
      this.loadExisting(this.announcementId)
    }
  }

  private buildForm(): void {
    this.form = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(200)]],
      body: ['', [Validators.required]],
      priority: ['info', Validators.required],
      isActive: [true],
      displayOrder: [0, [Validators.required, Validators.min(0)]],
      hasExpiry: [false],
      expiresAt: [''],
    })

    // When hasExpiry is toggled off, clear expiresAt so it doesn't block form validity.
    this.form.get('hasExpiry')?.valueChanges.subscribe((hasExpiry: boolean) => {
      const expiresAtCtrl = this.form.get('expiresAt')!
      if (hasExpiry) {
        expiresAtCtrl.setValidators([Validators.required])
      } else {
        expiresAtCtrl.clearValidators()
        expiresAtCtrl.setValue('')
      }
      expiresAtCtrl.updateValueAndValidity()
    })
  }

  private loadExisting(id: string): void {
    this.isLoading = true
    this.announcementsService.getById(id).subscribe({
      next: (row) => {
        this.isLoading = false
        if (!row) {
          this.error = 'Announcement not found.'
          return
        }
        this.original = row
        const hasExpiry = !!row.expiresAt
        // datetime-local input requires "YYYY-MM-DDTHH:mm" format
        const expiresAtValue = row.expiresAt
          ? new Date(row.expiresAt).toISOString().slice(0, 16)
          : ''

        this.form.patchValue({
          title: row.title,
          body: row.body,
          priority: row.priority,
          isActive: row.isActive,
          displayOrder: row.displayOrder,
          hasExpiry,
          expiresAt: expiresAtValue,
        })

        // Trigger the hasExpiry change handler to set validators correctly.
        if (hasExpiry) {
          this.form.get('expiresAt')?.setValidators([Validators.required])
          this.form.get('expiresAt')?.updateValueAndValidity()
        }
      },
      error: (err: unknown) => {
        this.isLoading = false
        this.error = err instanceof Error ? err.message : 'Failed to load announcement.'
      },
    })
  }

  get hasExpiryCtrl(): AbstractControl {
    return this.form.get('hasExpiry')!
  }

  submit(): void {
    if (this.form.invalid || this.isSaving) return
    this.error = null
    this.successMessage = null
    this.isSaving = true

    const v = this.form.value as {
      title: string
      body: string
      priority: 'critical' | 'info'
      isActive: boolean
      displayOrder: number
      hasExpiry: boolean
      expiresAt: string
    }

    const expiresAtIso = v.hasExpiry && v.expiresAt
      ? new Date(v.expiresAt).toISOString()
      : null

    if (this.isNew) {
      const input: AnnouncementCreateInput = {
        title: v.title.trim(),
        body: v.body.trim(),
        priority: v.priority,
        is_active: v.isActive,
        display_order: v.displayOrder,
        expires_at: expiresAtIso ?? undefined,
      }
      this.announcementsService.create(input).subscribe({
        next: (row) => {
          this.isSaving = false
          this.router.navigate(['/admin/announcements', row.id])
        },
        error: (err: unknown) => {
          this.isSaving = false
          this.error = err instanceof Error ? err.message : 'Create failed.'
        },
      })
    } else {
      const fields = this.buildDiff(v, expiresAtIso)
      if (Object.keys(fields).length === 0) {
        this.isSaving = false
        this.successMessage = 'No changes detected.'
        return
      }
      this.announcementsService.update(this.announcementId!, fields).subscribe({
        next: (row) => {
          this.isSaving = false
          this.original = row
          this.successMessage = 'Saved.'
        },
        error: (err: unknown) => {
          this.isSaving = false
          this.error = err instanceof Error ? err.message : 'Update failed.'
        },
      })
    }
  }

  /**
   * Build a diff map by comparing the form values against the original row.
   * Only sends fields that actually changed (mirrors iOS diff-and-send).
   */
  private buildDiff(
    v: {
      title: string
      body: string
      priority: 'critical' | 'info'
      isActive: boolean
      displayOrder: number
      hasExpiry: boolean
      expiresAt: string
    },
    expiresAtIso: string | null,
  ): Record<string, AdminFieldValue> {
    const orig = this.original!
    const diff: Record<string, AdminFieldValue> = {}

    if (v.title.trim() !== orig.title)      diff['title']         = { kind: 'string', value: v.title.trim() }
    if (v.body.trim()  !== orig.body)       diff['body']          = { kind: 'string', value: v.body.trim() }
    if (v.priority !== orig.priority)       diff['priority']      = { kind: 'string', value: v.priority }
    if (v.isActive !== orig.isActive)       diff['is_active']     = { kind: 'bool',   value: v.isActive }
    if (v.displayOrder !== orig.displayOrder) diff['display_order'] = { kind: 'int',  value: v.displayOrder }

    // Expiry 3-state:
    //   was null → now has value:  send the new ISO string
    //   had value → now cleared:   send null
    //   had value → new value:     send new ISO string if changed
    const origExpiry = orig.expiresAt
      ? new Date(orig.expiresAt).toISOString().slice(0, 19) + 'Z'
      : null
    const newExpiry = expiresAtIso
      ? new Date(expiresAtIso).toISOString().slice(0, 19) + 'Z'
      : null

    if (origExpiry !== newExpiry) {
      diff['expires_at'] = newExpiry
        ? { kind: 'string', value: newExpiry }
        : { kind: 'null' }
    }

    return diff
  }

  cancel(): void {
    this.router.navigate(['/admin/announcements'])
  }
}
