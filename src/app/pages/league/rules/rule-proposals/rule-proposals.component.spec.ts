import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { SupabaseService } from 'src/app/services/supabase.service';

import { RuleProposalsComponent } from './rule-proposals.component';

describe('RuleProposalsComponent', () => {
  let component: RuleProposalsComponent;
  let fixture: ComponentFixture<RuleProposalsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RuleProposalsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SupabaseService,
          useValue: {
            currentUser$: of(null),
            getUser: () => null,
            getProfile: () => null,
          },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(RuleProposalsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
