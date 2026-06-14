import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { LeagueHistoryService } from 'src/app/services/league-history.service';

import { WorldCupComponent } from './world-cup.component';

describe('WorldCupComponent', () => {
  let component: WorldCupComponent;
  let fixture: ComponentFixture<WorldCupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorldCupComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: LeagueHistoryService,
          useValue: { getWorldCupDivisions: () => of([]), getMatchupHistory: () => of([]) },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorldCupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
