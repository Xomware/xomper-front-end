import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RuleProposalsComponent } from './rule-proposals.component';

describe('RuleProposalsComponent', () => {
  let component: RuleProposalsComponent;
  let fixture: ComponentFixture<RuleProposalsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RuleProposalsComponent]
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
