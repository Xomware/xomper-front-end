import { Component } from "@angular/core";
import { LeagueComponent } from "../league/league.component";

@Component({
    selector: 'app-selected-league',
    template: `<app-league [mode]="'selected'"></app-league>`,
    standalone: true,
    imports: [LeagueComponent]
})
export class SelectedLeagueComponent {}