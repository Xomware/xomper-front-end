import { Component, EventEmitter, Input, Output } from '@angular/core'
import { NgIf } from '@angular/common'
import { SidebarComponent } from '../sidebar/sidebar.component'
import { SidebarSection } from '../sidebar/sidebar.entries'

@Component({
  selector: 'app-mobile-drawer',
  templateUrl: './mobile-drawer.component.html',
  styleUrls: ['./mobile-drawer.component.scss'],
  standalone: true,
  imports: [NgIf, SidebarComponent],
})
export class MobileDrawerComponent {
  @Input() open = false
  @Input() sections: SidebarSection[] = []
  @Input() isAdmin = false
  @Output() closed = new EventEmitter<void>()

  onScrimClick(): void {
    this.closed.emit()
  }

  onEntryActivated(): void {
    this.closed.emit()
  }
}
