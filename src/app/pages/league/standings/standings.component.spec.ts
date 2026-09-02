import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { StandingsComponent } from './standings.component';

describe('StandingsComponent', () => {
  let component: StandingsComponent;
  let fixture: ComponentFixture<StandingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StandingsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(StandingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

/**
 * "need quick jumps and filters for teams too"
 *
 * A twelve-team league is a lot of rows to scan for one name, and the
 * division view repeats them.
 */
describe('StandingsComponent team filter', () => {
  function build(teams: unknown[]) {
    const c = Object.create(StandingsComponent.prototype) as StandingsComponent
    ;(c as never as Record<string, unknown>)['filterText'] = ''
    return { c, teams: teams as never[] }
  }

  const team = (teamName: string, userName: string) => ({ teamName, userName })

  it('returns everything before anyone types', () => {
    const { c, teams } = build([team('Sharks', 'dom'), team('Bears', 'alex')])

    expect(c.matchTeams(teams).length).toBe(2)
    expect(c.filtering).toBe(false)
  })

  it('matches a team name', () => {
    const { c, teams } = build([team('Sharks', 'dom'), team('Bears', 'alex')])
    c.filterText = 'shark'

    expect(c.matchTeams(teams).map((t) => t.teamName)).toEqual(['Sharks'])
  })

  it('matches the manager too', () => {
    const { c, teams } = build([team('Sharks', 'dom'), team('Bears', 'alex')])
    c.filterText = 'alex'

    // Half of remembering a team is remembering who runs it.
    expect(c.matchTeams(teams).map((t) => t.teamName)).toEqual(['Bears'])
  })

  it('ignores whitespace-only input', () => {
    const { c, teams } = build([team('Sharks', 'dom')])
    c.filterText = '   '

    expect(c.filtering).toBe(false)
    expect(c.matchTeams(teams).length).toBe(1)
  })

  it('returns nothing when nothing matches', () => {
    const { c, teams } = build([team('Sharks', 'dom')])
    c.filterText = 'nobody'

    expect(c.matchTeams(teams)).toEqual([])
  })

  it('clears back to everything', () => {
    const { c, teams } = build([team('Sharks', 'dom')])
    c.filterText = 'nobody'

    c.clearFilter()

    expect(c.matchTeams(teams).length).toBe(1)
  })
})
