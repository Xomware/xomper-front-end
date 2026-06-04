import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MatchupsComponent } from './matchups.component';

describe('MatchupsComponent', () => {
  let component: MatchupsComponent;
  let fixture: ComponentFixture<MatchupsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MatchupsComponent]
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
