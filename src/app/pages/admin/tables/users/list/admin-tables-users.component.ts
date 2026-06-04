import { Component, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router } from '@angular/router'
import { TablesService } from 'src/app/services/tables.service'
import { WhitelistedUser } from 'src/app/models/whitelisted-user.model'

@Component({
  selector: 'app-admin-tables-users',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-tables-users.component.html',
  styleUrls: ['./admin-tables-users.component.scss'],
})
export class AdminTablesUsersComponent implements OnInit {
  users: WhitelistedUser[] = []
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
    this.tablesService.listUsers().subscribe({
      next: (users) => {
        this.users = users
        this.isLoading = false
      },
      error: (err: unknown) => {
        this.error = err instanceof Error ? err.message : 'Failed to load users.'
        this.isLoading = false
      },
    })
  }

  navigateEdit(user: WhitelistedUser): void {
    this.router.navigate(['/admin/tables/users', user.id])
  }

  displayLabel(user: WhitelistedUser): string {
    return user.displayName || user.sleeperUsername || user.email
  }
}
