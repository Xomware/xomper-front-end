import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { LeagueSettingsComponent } from './league-settings.component';

describe('LeagueSettingsComponent', () => {
  let component: LeagueSettingsComponent;
  let fixture: ComponentFixture<LeagueSettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeagueSettingsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
    .compileComponents();

    fixture = TestBed.createComponent(LeagueSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
