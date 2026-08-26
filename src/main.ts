import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';


import { LeagueService } from './app/services/league.service';
import { UserService } from './app/services/user.service';
import { StandingsService } from './app/services/standings.service';
import { TeamService } from './app/services/team.service';
import { PlayerService } from './app/services/player.service';
import { DraftService } from './app/services/draft.service';
import { SupabaseService } from './app/services/supabase.service';
import { LeagueHistoryService } from './app/services/league-history.service';
import { provideHttpClient, withInterceptors, withInterceptorsFromDi } from '@angular/common/http';
import { apiAuthInterceptor } from './app/interceptors/api-auth.interceptor';
import { BrowserModule, bootstrapApplication } from '@angular/platform-browser';
import { AppRoutingModule } from './app/app-routing.module';
import { FormsModule } from '@angular/forms';
import { provideAnimations } from '@angular/platform-browser/animations';
import { AppComponent } from './app/app.component';
import { importProvidersFrom } from '@angular/core';


bootstrapApplication(AppComponent, {
    providers: [
        importProvidersFrom(BrowserModule, AppRoutingModule, FormsModule),
        LeagueService,
        UserService,
        StandingsService,
        TeamService,
        PlayerService,
        DraftService,
        SupabaseService,
        LeagueHistoryService,
        provideHttpClient(withInterceptorsFromDi(), withInterceptors([apiAuthInterceptor])),
        provideAnimations()
    ]
})
  .catch(err => console.error(err));
