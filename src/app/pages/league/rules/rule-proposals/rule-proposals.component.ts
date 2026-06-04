import { Component, OnInit } from '@angular/core'
import { NgIf, NgFor } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { forkJoin, take } from 'rxjs'
import { LeagueService } from 'src/app/services/league.service'
import { RulesService, RuleProposal } from 'src/app/services/rules.service'
import { EmailService } from 'src/app/services/email.service'
import { ToastService } from 'src/app/services/toast.service'
import { SupabaseService } from 'src/app/services/supabase.service'

@Component({
  selector: 'app-rule-proposals',
  templateUrl: './rule-proposals.component.html',
  styleUrls: ['./rule-proposals.component.scss'],
  standalone: true,
  imports: [NgIf, NgFor, FormsModule],
})
export class RuleProposalsComponent implements OnInit {
  proposals: RuleProposal[] = []
  proposalFilter: 'all' | 'open' | 'approved' | 'rejected' = 'all'
  showProposalForm = false
  proposalTitle = ''
  proposalDescription = ''
  submittingProposal = false
  recentlyStamped: Set<string> = new Set()

  private leagueId = ''
  private leagueName = ''
  totalRosters = 12

  constructor(
    private leagueService: LeagueService,
    private rulesService: RulesService,
    private emailService: EmailService,
    private toastService: ToastService,
    private supabaseService: SupabaseService,
  ) {}

  ngOnInit(): void {
    const league = this.leagueService.getMyLeague()
    if (!league) return
    this.leagueId = league.getId()
    this.leagueName = league.getDisplayName()
    this.totalRosters = league.total_rosters || 12
    this.loadProposals()
  }

  get approvalThreshold(): number {
    return Math.ceil((this.totalRosters * 2) / 3)
  }

  get denialThreshold(): number {
    return this.totalRosters - this.approvalThreshold + 1
  }

  get currentUserId(): string | undefined {
    return this.supabaseService.getUser()?.id
  }

  get filteredProposals(): RuleProposal[] {
    if (this.proposalFilter === 'all') return this.proposals
    return this.proposals.filter((p) => p.status === this.proposalFilter)
  }

  loadProposals(): void {
    this.rulesService.getProposals(this.leagueId)
      .pipe(take(1))
      .subscribe({
        next: (proposals) => {
          this.proposals = proposals
          this.checkThresholds()
        },
      })
  }

  submitProposal(): void {
    if (!this.proposalTitle.trim()) return
    this.submittingProposal = true
    const title = this.proposalTitle.trim()
    const description = this.proposalDescription.trim()
    this.rulesService.createProposal(this.leagueId, title, description)
      .pipe(take(1))
      .subscribe({
        next: (success) => {
          if (success) {
            this.proposalTitle = ''
            this.proposalDescription = ''
            this.showProposalForm = false
            this.toastService.showPositiveToast('Proposal submitted!')
            this.loadProposals()

            const profile = this.supabaseService.getProfile()
            const proposerName =
              profile?.display_name ||
              profile?.sleeper_username ||
              profile?.email?.split('@')[0] ||
              'A league member'
            this.rulesService.getLeagueMemberEmails()
              .pipe(take(1))
              .subscribe((recipients) => {
                if (recipients.length > 0) {
                  this.emailService.sendRuleProposalEmail(
                    { title, description, proposed_by_username: proposerName } as RuleProposal,
                    recipients,
                    this.leagueName,
                  )
                }
              })
          } else {
            this.toastService.showNegativeToast('Failed to submit proposal.')
          }
          this.submittingProposal = false
        },
        error: () => {
          this.toastService.showNegativeToast('Failed to submit proposal.')
          this.submittingProposal = false
        },
      })
  }

  castVote(proposalId: string, vote: 'yes' | 'no'): void {
    this.rulesService.castVote(proposalId, vote)
      .pipe(take(1))
      .subscribe({
        next: (success) => {
          if (success) {
            this.loadProposals()
          } else {
            this.toastService.showNegativeToast('Failed to cast vote.')
          }
        },
      })
  }

  deleteProposal(proposalId: string): void {
    this.rulesService.deleteProposal(proposalId)
      .pipe(take(1))
      .subscribe({
        next: (success) => {
          if (success) {
            this.toastService.showPositiveToast('Proposal deleted.')
            this.loadProposals()
          } else {
            this.toastService.showNegativeToast('Failed to delete proposal.')
          }
        },
      })
  }

  getProposalDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  private checkThresholds(): void {
    this.proposals.forEach((p) => {
      if (p.status !== 'open') return
      if (p.yes_count >= this.approvalThreshold) {
        this.recentlyStamped.add(p.id)
        this.rulesService.updateProposalStatus(p.id, 'approved')
          .pipe(take(1))
          .subscribe({
            next: (success) => {
              if (success) {
                p.status = 'approved'
                this.toastService.showPositiveToast(`"${p.title}" has been APPROVED!`)
                this.sendRuleStatusEmail(p, 'approved')
              }
            },
          })
      } else if (p.no_count >= this.denialThreshold) {
        this.recentlyStamped.add(p.id)
        this.rulesService.updateProposalStatus(p.id, 'rejected')
          .pipe(take(1))
          .subscribe({
            next: (success) => {
              if (success) {
                p.status = 'rejected'
                this.toastService.showNegativeToast(`"${p.title}" has been DENIED.`)
                this.sendRuleStatusEmail(p, 'rejected')
              }
            },
          })
      }
    })
  }

  private sendRuleStatusEmail(proposal: RuleProposal, status: 'approved' | 'rejected'): void {
    forkJoin({
      voters: this.rulesService.getVoterNames(proposal.id),
      recipients: this.rulesService.getLeagueMemberEmails(),
    })
      .pipe(take(1))
      .subscribe(({ voters, recipients }) => {
        if (recipients.length === 0) return
        if (status === 'approved') {
          this.emailService.sendRuleAcceptedEmail(
            proposal,
            voters.approved_by,
            voters.rejected_by,
            recipients,
            this.leagueName,
          )
        } else {
          this.emailService.sendRuleDeniedEmail(
            proposal,
            voters.approved_by,
            voters.rejected_by,
            recipients,
            this.leagueName,
          )
        }
      })
  }
}
