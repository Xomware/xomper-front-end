import { Component } from '@angular/core'
import { NgIf } from '@angular/common';

@Component({
    selector: 'app-footer',
    templateUrl: './footer.component.html',
    styleUrls: ['./footer.component.scss'],
    standalone: true,
    imports: [NgIf]
})
export class FooterComponent {
  showDynamicButton = false
  footerButtonText = ''
  githubRepoUrl = 'https://github.com/domgiordano/xomper-front-end'

  openGitHubRepo(): void {
    window.open(this.githubRepoUrl, '_blank')
  }
}
