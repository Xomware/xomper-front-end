import { Component } from "@angular/core";
import { LeagueComponent } from "../league/league.component";

@Component({
    selector: 'app-my-league',
    template: `<app-league [mode]="'my'"></app-league>`,
    standalone: true,
    imports: [LeagueComponent]
})
export class MyLeagueComponent {}