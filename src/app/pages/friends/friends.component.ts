import { Component, OnInit } from '@angular/core'
import { NgFor, NgIf, NgTemplateOutlet } from '@angular/common'
import { RouterLink } from '@angular/router'
import { take } from 'rxjs/operators'
import { FriendsService, FriendGraph, Person } from 'src/app/services/friends.service'
import { UserService } from 'src/app/services/user.service'
import { LoaderComponent } from 'src/app/components/loader/loader.component'

/**
 * Friends: who you have, who asked, who you asked, and who you could add.
 *
 * Leaguemates are the only directory Xomper exposes. A search by Sleeper
 * handle would have to answer "does this handle have a Xomper account" for
 * any handle, and every Sleeper handle is public — sharing a league is the
 * consent that makes listing someone reasonable.
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

  graph: FriendGraph = {
    friends: [],
    incoming: [],
    outgoing: [],
    pendingCount: 0,
    suggestions: [],
  }

  /**
   * Held apart from `graph`, which is replaced wholesale by every mutation
   * response — and those responses carry no suggestions, since the server
   * only builds them when asked. Without this, adding one person emptied the
   * list of everyone else.
   */
  suggestions: Person[] = []

  constructor(
    private friends: FriendsService,
    private userService: UserService,
  ) {}

  ngOnInit(): void {
    this.friends.load(true).pipe(take(1)).subscribe((graph) => {
      this.graph = graph
      this.suggestions = graph.suggestions
      this.loading = false
    })
  }

  accept(person: Person): void {
    this.act(person, this.friends.accept(person.userId))
  }

  add(person: Person): void {
    // Drop them from the list on success only: a failed request that removed
    // the row would leave no way to try again.
    this.act(person, this.friends.request(person.userId), () => {
      this.suggestions = this.suggestions.filter((p) => p.userId !== person.userId)
    })
  }

  /** Decline, cancel and unfriend are the same call; only the label differs. */
  remove(person: Person): void {
    this.act(person, this.friends.remove(person.userId))
  }

  private act(
    person: Person,
    request: ReturnType<FriendsService['accept']>,
    onSuccess?: () => void,
  ): void {
    this.error = ''
    this.busyWith = person.userId
    request.pipe(take(1)).subscribe({
      next: (graph) => {
        this.graph = graph
        this.busyWith = ''
        onSuccess?.()
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
      !this.graph.outgoing.length &&
      !this.suggestions.length
    )
  }
}
