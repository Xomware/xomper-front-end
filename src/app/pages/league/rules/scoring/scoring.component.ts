import { Component, OnInit } from '@angular/core'
import { NgFor } from '@angular/common'
import { LeagueService } from 'src/app/services/league.service'

@Component({
  selector: 'app-scoring',
  templateUrl: './scoring.component.html',
  styleUrls: ['./scoring.component.scss'],
  standalone: true,
  imports: [NgFor],
})
export class ScoringComponent implements OnInit {
  scoringCategories: {
    name: string
    settings: { key: string; label: string; value: number }[]
  }[] = []

  private static readonly SCORING_KEY_LABELS: Record<string, string> = {
    pass_yd: 'Pass Yards',
    pass_td: 'Pass TD',
    pass_int: 'Interception',
    pass_2pt: 'Pass 2PT',
    pass_att: 'Pass Attempts',
    pass_cmp: 'Completions',
    pass_inc: 'Incompletions',
    rush_yd: 'Rush Yards',
    rush_td: 'Rush TD',
    rush_2pt: 'Rush 2PT',
    rush_att: 'Rush Attempts',
    rec: 'Receptions',
    rec_yd: 'Rec Yards',
    rec_td: 'Rec TD',
    rec_2pt: 'Rec 2PT',
    bonus_rec_te: 'TE Premium',
    bonus_rec_wr: 'WR Bonus',
    bonus_rec_rb: 'RB Rec Bonus',
    bonus_rush_yd_100: '100+ Rush Yds',
    bonus_rec_yd_100: '100+ Rec Yds',
    bonus_pass_yd_300: '300+ Pass Yds',
    pr_td: 'Punt Return TD',
    kr_td: 'Kick Return TD',
    fum: 'Fumble',
    fum_lost: 'Fumble Lost',
    fum_rec: 'Fumble Recovery',
    fum_rec_td: 'Fumble Rec TD',
    fg_0_19: 'FG 0-19',
    fg_20_29: 'FG 20-29',
    fg_30_39: 'FG 30-39',
    fg_40_49: 'FG 40-49',
    fg_50p: 'FG 50+',
    fg_miss: 'FG Miss',
    fg_miss_0_19: 'FG Miss 0-19',
    fg_miss_20_29: 'FG Miss 20-29',
    fg_miss_30_39: 'FG Miss 30-39',
    fg_miss_40_49: 'FG Miss 40-49',
    fg_miss_50p: 'FG Miss 50+',
    xpm: 'XP Made',
    xpmiss: 'XP Missed',
    sack: 'Sack',
    int: 'INT',
    ff: 'Forced Fumble',
    def_td: 'Defensive TD',
    safe: 'Safety',
    blk_kick: 'Blocked Kick',
    pts_allow_0: '0 Pts Allowed',
    pts_allow_1_6: '1-6 Pts Allowed',
    pts_allow_7_13: '7-13 Pts Allowed',
    pts_allow_14_20: '14-20 Pts Allowed',
    pts_allow_21_27: '21-27 Pts Allowed',
    pts_allow_28_34: '28-34 Pts Allowed',
    pts_allow_35p: '35+ Pts Allowed',
    st_td: 'ST TD',
    st_ff: 'ST Forced Fumble',
    st_fum_rec: 'ST Fumble Rec',
    def_st_td: 'Def/ST TD',
    def_st_ff: 'Def/ST FF',
    def_st_fum_rec: 'Def/ST Fum Rec',
  }

  private static readonly SCORING_CATEGORIES: { name: string; prefixes: string[] }[] = [
    { name: 'Passing', prefixes: ['pass_'] },
    { name: 'Rushing', prefixes: ['rush_'] },
    { name: 'Receiving', prefixes: ['rec', 'bonus_rec'] },
    { name: 'Return TDs', prefixes: ['pr_', 'kr_'] },
    { name: 'Fumbles', prefixes: ['fum'] },
    { name: 'Kicking', prefixes: ['fg_', 'xp'] },
  ]

  constructor(private leagueService: LeagueService) {}

  ngOnInit(): void {
    const league = this.leagueService.getMyLeague()
    if (!league) return

    const scoring = league.getScoringSettings()
    const usedKeys = new Set<string>()

    this.scoringCategories = ScoringComponent.SCORING_CATEGORIES.map((cat) => {
      const settings = Object.entries(scoring)
        .filter(([key]) => cat.prefixes.some((p) => key.startsWith(p)) && !usedKeys.has(key))
        .map(([key, value]) => {
          usedKeys.add(key)
          return {
            key,
            label: ScoringComponent.SCORING_KEY_LABELS[key] || this.formatScoringKey(key),
            value,
          }
        })
        .filter((s) => s.value !== 0)
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      return { name: cat.name, settings }
    }).filter((cat) => cat.settings.length > 0)
  }

  private formatScoringKey(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }
}
