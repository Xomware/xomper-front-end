import { Component, OnInit } from '@angular/core'
import { NgFor, NgIf, NgTemplateOutlet } from '@angular/common'
import { RouterLink } from '@angular/router'
import { take } from 'rxjs/operators'
import { FriendsService, FriendGraph, Person } from 'src/app/services/friends.service'
import { UserService } from 'src/app/services/user.service'
import { LoaderComponent } from 'src/app/components/loader/loader.component'

/**
 * Friends: who you have, who asked, who you asked.
 *
 * People are found through the existing search — a username resolves to a
 * Sleeper account, and a Sleeper account resolves to a Xomper user only if
 * they have one. Rather than build a second people-search, this page hangs
 * off the graph the API already returns and points elsewhere for finding
 * someone new.
 */
@Component({
  selector: 'app-friends',
  standalone: true,
  imports: [NgIf, NgFor, NgTemplateOutlet, RouterLink, LoaderComponent],
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.scss'],
})
export class FriendsComponent implements OnInit {
  loading = true
  error = ''
  busyWith = ''

  graph: FriendGraph = { friends: [], incoming: [], outgoing: [], pendingCount: 0 }

  constructor(
    private friends: FriendsService,
    private userService: UserService,
  ) {}

  ngOnInit(): void {
    this.friends.load().pipe(take(1)).subscribe((graph) => {
      this.graph = graph
      this.loading = false
    })
  }

  accept(person: Person): void {
    this.act(person, this.friends.accept(person.userId))
  }

  /** Decline, cancel and unfriend are the same call; only the label differs. */
  remove(person: Person): void {
    this.act(person, this.friends.remove(person.userId))
  }

  private act(person: Person, request: ReturnType<FriendsService['accept']>): void {
    this.error = ''
    this.busyWith = person.userId
    request.pipe(take(1)).subscribe({
      next: (graph) => {
        this.graph = graph
        this.busyWith = ''
      },
      error: (err) => {
        this.busyWith = ''
        this.error = err?.error?.error?.message ?? 'That did not work.'
      },
    })
  }

  avatarUrl(person: Person): string | null {
    return person.sleeperAvatar
      ? this.userService.buildAvatar(person.sleeperAvatar)
      : null
  }

  initials(person: Person): string {
    return (person.displayName || '?').slice(0, 1).toUpperCase()
  }

  /**
   * Query params for someone else's profile.
   *
   * /selected-profile resolves through Sleeper's /user/{id_or_username},
   * which takes either form -- so the handle works and no Sleeper numeric id
   * has to be carried on Person just for this link.
   */
  profileParams(person: Person): { userId: string } {
    return { userId: person.sleeperUsername }
  }

  get isEmpty(): boolean {
    return (
      !this.graph.friends.length &&
      !this.graph.incoming.length &&
      !this.graph.outgoing.length
    )
  }
}
