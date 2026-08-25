import { Injectable } from '@angular/core'
import { HttpClient, HttpHeaders } from '@angular/common/http'
import { environment } from 'src/environments/environment'
import { RuleProposal } from './rules.service'

@Injectable({
  providedIn: 'root',
})
export class EmailService {
  private xomperApiUrl = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`

  constructor(private http: HttpClient) {}

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
    })
  }

  sendRuleProposalEmail(proposal: RuleProposal, recipients: string[], leagueName: string): void {
    const body = {
      proposal: {
        title: proposal.title,
        description: proposal.description,
        proposed_by_username: proposal.proposed_by_username,
        league_name: leagueName,
      },
      recipients,
    }
    this.http
      .post(`${this.xomperApiUrl}/email/rule-proposal`, body, {
        headers: this.headers,
      })
      .subscribe({
        error: () => { /* Failed to send rule proposal email */ },
      })
  }

  sendRuleAcceptedEmail(
    proposal: RuleProposal,
    approvedBy: string[],
    rejectedBy: string[],
    recipients: string[],
    leagueName: string,
  ): void {
    const body = {
      proposal: {
        title: proposal.title,
        description: proposal.description,
        proposed_by_username: proposal.proposed_by_username,
        league_name: leagueName,
      },
      approved_by: approvedBy,
      rejected_by: rejectedBy,
      recipients,
    }
    this.http
      .post(`${this.xomperApiUrl}/email/rule-accept`, body, {
        headers: this.headers,
      })
      .subscribe({
        error: () => { /* Failed to send rule accepted email */ },
      })
  }

  sendRuleDeniedEmail(
    proposal: RuleProposal,
    approvedBy: string[],
    rejectedBy: string[],
    recipients: string[],
    leagueName: string,
  ): void {
    const body = {
      proposal: {
        title: proposal.title,
        description: proposal.description,
        proposed_by_username: proposal.proposed_by_username,
        league_name: leagueName,
      },
      approved_by: approvedBy,
      rejected_by: rejectedBy,
      recipients,
    }
    this.http
      .post(`${this.xomperApiUrl}/email/rule-deny`, body, {
        headers: this.headers,
      })
      .subscribe({
        error: () => { /* Failed to send rule denied email */ },
      })
  }

  sendTaxiStealEmail(
    stealer: { display_name: string },
    player: {
      first_name: string
      last_name: string
      position: string
      team: string
      player_image_url: string
      team_logo_url: string
      pick_cost: string
    },
    owner: { display_name: string; email: string },
    recipients: string[],
    leagueName: string,
  ): void {
    const body = { stealer, player, owner, recipients, league_name: leagueName }
    this.http
      .post(`${this.xomperApiUrl}/email/taxi`, body, { headers: this.headers })
      .subscribe({
        error: () => { /* Failed to send taxi steal email */ },
      })
  }
}
