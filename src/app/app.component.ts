import { Component, OnDestroy } from '@angular/core'
import { LeagueService } from './services/league.service'
import { UserService } from './services/user.service'
import { TeamService } from './services/team.service'
import { PlayerService } from './services/player.service'
import { AmbientBackgroundComponent } from './components/ambient-background/ambient-background.component'
import { ToolbarComponent } from './components/toolbar/toolbar.component'
import { ToastComponent } from './components/toast/toast.component'
import { RouterOutlet } from '@angular/router'
import { FooterComponent } from './components/footer/footer.component'
import { XomperNewShellDirective } from './directives/xomper-new-shell.directive'
import { ShellLayoutComponent } from './components/shell-layout/shell-layout.component'

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [
    AmbientBackgroundComponent,
    ToolbarComponent,
    ToastComponent,
    RouterOutlet,
    FooterComponent,
    XomperNewShellDirective,
    ShellLayoutComponent,
  ],
})
export class AppComponent implements OnDestroy {
  title = 'XOMPER'

  constructor(
    private leagueService: LeagueService,
    private userService: UserService,
    private teamService: TeamService,
    private playerService: PlayerService,
  ) {}

  ngOnDestroy(): void {
    this.leagueService.reset()
    this.userService.reset()
    this.teamService.reset()
    this.playerService.reset()
  }
}
