import { Component } from "@angular/core";
import { TeamComponent } from "../team/team.component";

@Component({
    selector: 'app-my-team',
    template: `<app-team [mode]="'my'"></app-team>`,
    standalone: true,
    imports: [TeamComponent]
})
export class MyTeamComponent {}