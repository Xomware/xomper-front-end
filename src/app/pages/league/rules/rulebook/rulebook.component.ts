import { Component } from '@angular/core'
import { NgFor, NgIf } from '@angular/common'

@Component({
  selector: 'app-rulebook',
  templateUrl: './rulebook.component.html',
  styleUrls: ['./rulebook.component.scss'],
  standalone: true,
  imports: [NgFor, NgIf],
})
export class RulebookComponent {
  expandedRuleSections: Set<number> = new Set()

  readonly LEAGUE_RULES: { title: string; content: string }[] = [
    {
      title: '1. League Setup',
      content: `<strong>A. Divisions</strong><br>Three divisions of 4. Divisions are set for four years then reset based on standings in the fourth year regular season.<br><br><em>Division realignment by finish:</em><br>ACC: #1 (Winner), #6, #7, #12 (Last)<br>SEC: #2, #5, #8, #11<br>Big 10: #3, #4, #9, #10<br><br><strong>World Cup Tournament</strong><br>Every four years there is a season-long in-season tournament. Top 2 teams from each division over the first 3 years compete in a 6-team tournament during the 4th year. Only intra-divisional games count. Tiebreaker: overall record, then H2H, then total points.<br><br><em>Rounds:</em><br>Round 1: Total points weeks 3-6. Top 4 advance.<br>Round 2: #1 vs #4, #2 vs #3. Aggregate points weeks 7-10.<br>Round 3: Winners aggregate points weeks 11-14.<br><br><strong>B. Fantasy Host Site</strong> &mdash; Sleeper.app`,
    },
    {
      title: '2. Schedule & Season Format',
      content: `<strong>A. Regular Season</strong><br>Week 14 is the last week of the regular season.<br><br><strong>B. Playoffs</strong><br>Playoffs begin Week 15 and end Week 17 (1-week matchups). In a tie, the higher seed wins. 6 teams make the playoffs: top team from each division seeded 1-3, plus 3 wild card spots. Overall record determines standings; tiebreaker is total points for.<br><br>No consolation games or 3rd place match. Eliminated teams are ranked by seed at time of elimination.<br><br><strong>C. Offseason</strong><br>No free agency adds during offseason &mdash; only via Rookie/FA draft. Trading of players and picks is allowed. Roster cuts due by midnight the Sunday after NFL preseason concludes.`,
    },
    {
      title: '3. Roster Rules, Trading & Add/Drops',
      content: `<strong>A. Roster Sizes</strong> &mdash; 26 active + 4 taxi + 8 IR<br><br><strong>B. Starting Requirements</strong><br>1 QB, 2 RB, 2 WR, 1 TE, 2 FLEX (RB/WR/TE), 1 SUPERFLEX (QB/RB/WR/TE)<br><br>No purposely starting bye/injured/inactive players to tank. Active players must be used. $5 penalty for playing an inactive player while tanking (goes to winner's pot).<br><br><strong>C. Taxi Squad Steals</strong><br>Teams can steal another team's taxi player with draft pick compensation:<br><table class="rules-table"><tr><th>Round Taken</th><th>Minimum Cost</th></tr><tr><td>1st</td><td>1st + 2nd round pick</td></tr><tr><td>2nd</td><td>1st round pick</td></tr><tr><td>3rd</td><td>2nd round pick</td></tr><tr><td>4th</td><td>3rd round pick</td></tr><tr><td>5th</td><td>4th round pick</td></tr><tr><td>Undrafted</td><td>5th round pick</td></tr></table><br>Owner can promote the taxi player before Thursday 12pm EST to nullify the steal.<br><br><strong>D. Injured Reserve</strong> &mdash; 8 IR slots per team.<br><br><strong>E. Trading</strong><br>Trades can be uneven. Rosters must be adjusted to 26 active immediately. Vetoes require unanimous vote with evidence of collusion. Picks up to 2 years out can be traded.<br><br><strong>F. Trade Deadline</strong> &mdash; 2 weeks after NFL trade deadline (Tuesday after Week 10 at noon).<br><br><strong>G. Add/Drops</strong> &mdash; Deadline at conclusion of regular season. No adds once the first game of the week starts.<br><br><strong>H. Roster Cuts</strong> &mdash; By midnight Sunday after NFL preseason. Max: 26 active + 4 taxi + 8 IR = 38 total.<br><br><strong>I. Waivers</strong> &mdash; Dropped players clear waivers by Wednesday morning. Waiver order does not reset; claiming moves you to the back.`,
    },
    {
      title: '4. Scoring',
      content: `<strong>QB, RB, WR, TE Scoring:</strong><br><table class="rules-table"><tr><th>Event</th><th>Points</th></tr><tr><td>Passing TD</td><td>4 pts</td></tr><tr><td>Passing Yards</td><td>1 per 25 yds (0.04/yd)</td></tr><tr><td>Interception Thrown</td><td>-2 pts</td></tr><tr><td>Pass 2PT Conversion</td><td>2 pts</td></tr><tr><td>Rushing TD</td><td>6 pts</td></tr><tr><td>Rushing Yards</td><td>1 per 10 yds (0.1/yd)</td></tr><tr><td>Rush 2PT Conversion</td><td>2 pts</td></tr><tr><td>Receiving TD</td><td>6 pts</td></tr><tr><td>Receiving Yards</td><td>1 per 10 yds (0.1/yd)</td></tr><tr><td>Receptions (PPR)</td><td>1 pt (TE: 1.5 pts)</td></tr><tr><td>Rec 2PT Conversion</td><td>2 pts</td></tr><tr><td>Punt/Kick Return TD</td><td>6 pts</td></tr><tr><td>Fumble Lost</td><td>-2 pts</td></tr></table>`,
    },
    {
      title: '5. Draft Information',
      content: `<strong>A. Startup Draft</strong> &mdash; Snake draft, order randomized.<br><br><strong>B. Rookie Draft</strong><br>Not a snake draft. Last place gets 1.01, 2.01, 3.01, 4.01, 5.01. Picks are tradeable. Any free agents not added before the championship add/drop deadline are also eligible.<br><br><strong>C. Draft Order</strong><br>Non-playoff teams: determined by overall record.<br>Playoff teams: determined by playoff performance. Eliminated teams with worse seeds get better picks.`,
    },
    {
      title: '6. Dues & Payouts',
      content: `<strong>A. Dues</strong> &mdash; $100 per season.<br><br><strong>B. Payout Structure:</strong><br><table class="rules-table"><tr><th>Award</th><th>Payout</th></tr><tr><td>Champion</td><td>$600</td></tr><tr><td>2nd Place</td><td>$200</td></tr><tr><td>3rd Place</td><td>$80</td></tr><tr><td>4th Place</td><td>$80</td></tr><tr><td>Highest Weekly Score (x14)</td><td>$10 each</td></tr><tr><td>World Cup Winner (every 4 yrs)</td><td>$400</td></tr></table><br>MVP awards for positional leaders (player must have been started that week to count).`,
    },
    {
      title: '7. Rule Changes',
      content: `<strong>2/3 Vote Required</strong><br>Rule change voting occurs in the offseason. At least 8 owners (of 12) must vote in favor for a rule change to become permanent.<br><br>A <strong>100% unanimous vote</strong> can enact a rule effective immediately.`,
    },
  ]

  toggleRuleSection(index: number): void {
    if (this.expandedRuleSections.has(index)) {
      this.expandedRuleSections.delete(index)
    } else {
      this.expandedRuleSections.add(index)
    }
  }
}
