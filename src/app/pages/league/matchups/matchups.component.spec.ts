import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { LeagueHistoryService } from 'src/app/services/league-history.service';

import { MatchupsComponent } from './matchups.component';

describe('MatchupsComponent', () => {
  let component: MatchupsComponent;
  let fixture: ComponentFixture<MatchupsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MatchupsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: LeagueHistoryService,
          useValue: { getMatchupHistoryFromChain: () => of([]), getMatchupHistory: () => of([]) },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(MatchupsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
