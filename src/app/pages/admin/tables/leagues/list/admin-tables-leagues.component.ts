import { Component, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router } from '@angular/router'
import { TablesService } from 'src/app/services/tables.service'
import { WhitelistedLeague } from 'src/app/models/whitelisted-league.model'

@Component({
  selector: 'app-admin-tables-leagues',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-tables-leagues.component.html',
  styleUrls: ['./admin-tables-leagues.component.scss'],
})
export class AdminTablesLeaguesComponent implements OnInit {
  leagues: WhitelistedLeague[] = []
  isLoading = false
  error: string | null = null

  constructor(
    private tablesService: TablesService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.load()
  }

  load(): void {
    this.isLoading = true
    this.error = null
    this.tablesService.listLeagues().subscribe({
      next: (leagues) => {
        this.leagues = leagues
        this.isLoading = false
      },
      error: (err: unknown) => {
        this.error = err instanceof Error ? err.message : 'Failed to load leagues.'
        this.isLoading = false
      },
    })
  }

  navigateEdit(league: WhitelistedLeague): void {
    this.router.navigate(['/admin/tables/leagues', league.id])
  }
}
