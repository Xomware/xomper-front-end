import { Component, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ActivatedRoute, Router } from '@angular/router'
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms'
import { TablesService } from 'src/app/services/tables.service'
import { WhitelistedLeague } from 'src/app/models/whitelisted-league.model'
import { AdminFieldValue } from 'src/app/models/admin-field-value.model'

@Component({
  selector: 'app-admin-league-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-league-edit.component.html',
  styleUrls: ['./admin-league-edit.component.scss'],
})
export class AdminLeagueEditComponent implements OnInit {
  form!: FormGroup
  league: WhitelistedLeague | null = null
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
    if (id) this.loadLeague(id)
  }

  private buildForm(): void {
    this.form = this.fb.group({
      leagueName: ['', [Validators.required, Validators.maxLength(200)]],
      isActive:   [false],
      isDynasty:  [false],
      hasTaxi:    [false],
    })
  }

  private loadLeague(id: string): void {
    this.isLoading = true
    this.tablesService.listLeagues().subscribe({
      next: (leagues) => {
        this.isLoading = false
        const found = leagues.find((l) => l.id === id) ?? null
        if (!found) {
          this.error = 'League not found.'
          return
        }
        this.league = found
        this.form.patchValue({
          leagueName: found.leagueName,
          isActive:   found.isActive,
          isDynasty:  found.isDynasty,
          hasTaxi:    found.hasTaxi,
        })
      },
      error: (err: unknown) => {
        this.isLoading = false
        this.error = err instanceof Error ? err.message : 'Failed to load league.'
      },
    })
  }

  submit(): void {
    if (this.form.invalid || this.isSaving || !this.league) return
    this.error = null
    this.successMessage = null

    const diff = this.buildDiff()
    if (Object.keys(diff).length === 0) {
      this.successMessage = 'No changes detected.'
      return
    }

    this.isSaving = true
    this.tablesService.updateLeague(this.league.leagueId, diff).subscribe({
      next: () => {
        this.isSaving = false
        this.successMessage = 'Saved.'
        const v = this.form.value as { leagueName: string; isActive: boolean; isDynasty: boolean; hasTaxi: boolean }
        this.league = {
          ...this.league!,
          leagueName: v.leagueName.trim(),
          isActive: v.isActive,
          isDynasty: v.isDynasty,
          hasTaxi: v.hasTaxi,
        }
      },
      error: (err: unknown) => {
        this.isSaving = false
        this.error = err instanceof Error ? err.message : 'Save failed.'
      },
    })
  }

  private buildDiff(): Record<string, AdminFieldValue> {
    const orig = this.league!
    const v = this.form.value as { leagueName: string; isActive: boolean; isDynasty: boolean; hasTaxi: boolean }
    const diff: Record<string, AdminFieldValue> = {}

    if (v.leagueName.trim() !== orig.leagueName) diff['league_name'] = { kind: 'string', value: v.leagueName.trim() }
    if (v.isActive  !== orig.isActive)            diff['is_active']  = { kind: 'bool',   value: v.isActive }
    if (v.isDynasty !== orig.isDynasty)           diff['is_dynasty'] = { kind: 'bool',   value: v.isDynasty }
    if (v.hasTaxi   !== orig.hasTaxi)             diff['has_taxi']   = { kind: 'bool',   value: v.hasTaxi }

    return diff
  }

  cancel(): void {
    this.router.navigate(['/admin/tables/leagues'])
  }

  get leagueId(): string {
    return this.league?.leagueId ?? '—'
  }

  get season(): string {
    return this.league?.season ?? '—'
  }
}
