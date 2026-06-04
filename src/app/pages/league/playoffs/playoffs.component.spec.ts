import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlayoffsComponent } from './playoffs.component';

describe('PlayoffsComponent', () => {
  let component: PlayoffsComponent;
  let fixture: ComponentFixture<PlayoffsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayoffsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlayoffsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
