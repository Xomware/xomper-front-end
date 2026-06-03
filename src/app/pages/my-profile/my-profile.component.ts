import { Component } from "@angular/core";
import { ProfileComponent } from "../profile/profile.component";

@Component({
    selector: 'app-my-profile',
    template: `<app-profile [mode]="'my'"></app-profile>`,
    standalone: true,
    imports: [ProfileComponent]
})
export class MyProfileComponent {}