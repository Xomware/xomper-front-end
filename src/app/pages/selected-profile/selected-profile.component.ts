import { Component } from "@angular/core";
import { ProfileComponent } from "../profile/profile.component";

@Component({
    selector: 'app-selected-profile',
    template: `<app-profile [mode]="'selected'"></app-profile>`,
    standalone: true,
    imports: [ProfileComponent]
})
export class SelectedProfileComponent {}