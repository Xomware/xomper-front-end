import { Component, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { NgClass, NgIf, NgFor, KeyValuePipe } from '@angular/common'
import { LeagueService } from 'src/app/services/league.service'
import { StandingsService } from 'src/app/services/standings.service'
import { TeamService } from 'src/app/services/team.service'
import { UserService } from 'src/app/services/user.service'
import { LeagueModel } from 'src/app/models/league.model'
import { StandingsTeamModel } from 'src/app/models/standings.model'
import { LoaderComponent } from '../../../components/loader/loader.component'

@Component({
  selector: 'app-standings',
  templateUrl: './standings.component.html',
  styleUrls: ['./standings.component.scss'],
  standalone: true,
  imports: [LoaderComponent, NgClass, NgIf, NgFor, KeyValuePipe],
})
export class StandingsComponent implements OnInit {
  loading = false
  viewMode: 'league' | 'division' = 'league'
  standings: StandingsTeamModel[] = []
  standingsByDivision: Record<string, StandingsTeamModel[]> = {}
  league: LeagueModel | null = null
  leaguePlayoffTeams = 0

  constructor(
    private leagueService: LeagueService,
    private standingsService: StandingsService,
    private teamService: TeamService,
    private userService: UserService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.league = this.leagueService.getMyLeague()
    if (!this.league) return

    this.leaguePlayoffTeams = this.league.getPlayoffTeams()
    this.standings = this.league.getStandingsTeams()
    this.standingsByDivision = this.standingsService.buildDivisionStandings(this.standings)
  }

  selectCurrentTeam(team: StandingsTeamModel): void {
    const leagueId = this.league?.getId() ?? ''
    if (team.getTeamName() === this.teamService.getMyTeam()?.getTeamName()) {
      this.router.navigate(['/my-team'], {
        queryParams: { user: this.teamService.getMyTeam()?.getUserName(), league: leagueId },
      })
    } else {
      this.teamService.setCurrentTeam(team)
      this.router.navigate(['/selected-team'], {
        queryParams: { user: team.getUserName(), league: leagueId },
      })
    }
  }

  goToUserProfile(userId: string): void {
    if (!userId) return
    if (userId === this.userService.getMyUser()?.getUserId()) {
      this.router.navigate(['/my-profile'], { queryParams: { userId } })
    } else {
      this.router.navigate(['/selected-profile'], { queryParams: { userId } })
    }
  }
}
