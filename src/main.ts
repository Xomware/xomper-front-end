import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Amplify } from 'aws-amplify';
import { environment } from './environments/environment';
import { LeagueService } from './app/services/league.service';
import { UserService } from './app/services/user.service';
import { StandingsService } from './app/services/standings.service';
import { TeamService } from './app/services/team.service';
import { PlayerService } from './app/services/player.service';
import { DraftService } from './app/services/draft.service';
import { provideHttpClient, withInterceptors, withInterceptorsFromDi } from '@angular/common/http';
import { apiAuthInterceptor } from './app/interceptors/api-auth.interceptor';
import { BrowserModule, bootstrapApplication } from '@angular/platform-browser';
import { AppRoutingModule } from './app/app-routing.module';
import { FormsModule } from '@angular/forms';
import { provideAnimations } from '@angular/platform-browser/animations';
import { AppComponent } from './app/app.component';
import { importProvidersFrom } from '@angular/core';


// Configure Amplify before bootstrap. CognitoService is providedIn: 'root'
// and checks for a session in its constructor, so a component injecting it
// during the first render would otherwise hit an unconfigured Auth module.
//
// `oauth` covers the Google button only. Email sign-in runs against Cognito
// directly via SRP, so the hosted domain is never involved for it -- but
// federated sign-in has no API outside the hosted domain, so that one flow
// redirects.
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: environment.cognitoUserPoolId,
      userPoolClientId: environment.cognitoClientId,
      loginWith: {
        oauth: {
          domain: environment.cognitoDomain,
          scopes: ['email', 'openid', 'profile'],
          redirectSignIn: [`${environment.baseCallbackUrl}/auth/callback`],
          redirectSignOut: [environment.baseCallbackUrl],
          responseType: 'code',
        },
      },
    },
  },
});



bootstrapApplication(AppComponent, {
    providers: [
        importProvidersFrom(BrowserModule, AppRoutingModule, FormsModule),
        LeagueService,
        UserService,
        StandingsService,
        TeamService,
        PlayerService,
        DraftService,
        provideHttpClient(withInterceptorsFromDi(), withInterceptors([apiAuthInterceptor])),
        provideAnimations()
    ]
})
  .catch(err => console.error(err));
