import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';


import { LeagueService } from './app/services/league.service';
import { UserService } from './app/services/user.service';
import { StandingsService } from './app/services/standings.service';
import { TeamService } from './app/services/team.service';
import { PlayerService } from './app/services/player.service';
import { TaxiSquadService } from './app/services/taxi-squad.service';
import { DraftService } from './app/services/draft.service';
import { SupabaseService } from './app/services/supabase.service';
import { LeagueHistoryService } from './app/services/league-history.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
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
        TaxiSquadService,
        DraftService,
        SupabaseService,
        LeagueHistoryService,
        provideHttpClient(withInterceptorsFromDi()),
        provideAnimations()
    ]
})
  .catch(err => console.error(err));
