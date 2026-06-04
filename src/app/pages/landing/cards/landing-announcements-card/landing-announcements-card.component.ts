import { Component, OnInit } from '@angular/core'
import { NgIf, NgFor } from '@angular/common'
import { AnnouncementsService } from 'src/app/services/announcements.service'
import { LeagueAnnouncement } from 'src/app/models/league-announcement.model'

/**
 * Announcements stacked card — mirrors iOS AnnouncementsCard.
 * Collapses to zero height when the filtered list is empty.
 * Body rendered as plain text (s10 will add markdown; iOS uses AttributedString).
 * Critical rows get a red left-edge accent.
 * // TODO(s10): replace [innerText] body with a markdown pipe
 */
@Component({
  selector: 'app-landing-announcements-card',
  standalone: true,
  imports: [NgIf, NgFor],
  templateUrl: './landing-announcements-card.component.html',
  styleUrls: ['./landing-announcements-card.component.scss'],
})
export class LandingAnnouncementsCardComponent implements OnInit {
  announcements: LeagueAnnouncement[] = []

  constructor(private announcementsService: AnnouncementsService) {}

  ngOnInit(): void {
    this.announcementsService.list().subscribe({
      next: (items) => {
        this.announcements = items
      },
      error: () => {
        this.announcements = []
      },
    })
  }

  isCritical(a: LeagueAnnouncement): boolean {
    return a.priority === 'critical'
  }
}
