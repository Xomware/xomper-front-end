import { Component } from "@angular/core";
import { TeamComponent } from "../team/team.component";

@Component({
    selector: 'app-selected-team',
    template: `<app-team [mode]="'selected'"></app-team>`,
    standalone: true,
    imports: [TeamComponent]
})
export class SelectedTeamComponent {}