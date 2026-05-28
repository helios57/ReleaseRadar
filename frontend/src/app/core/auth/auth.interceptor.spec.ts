import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authInterceptor } from './auth.interceptor';
import { SessionStore } from './session.store';
import { LiveService } from '../live.service';

describe('authInterceptor (401 degrade-to-anonymous)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let session: SessionStore;
  let live: LiveService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
    live = TestBed.inject(LiveService);

    // Establish an authenticated session via the real /api/me load path.
    session.load();
    httpMock
      .expectOne('/api/me')
      .flush({ id: 'a@example.com', email: 'a@example.com', role: 'admin', groups: [] });
    expect(session.user()).not.toBeNull();
  });

  afterEach(() => httpMock.verify());

  it('clears the session and stops the live channel on a 401 from an API call', () => {
    const disconnect = vi.spyOn(live, 'disconnect');
    http.get('/api/rollouts').subscribe({ next: () => {}, error: () => {} });
    httpMock
      .expectOne('/api/rollouts')
      .flush('unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(session.user()).toBeNull();
    expect(disconnect).toHaveBeenCalled();
  });

  it('does NOT degrade on a 401 from the /api/me probe', () => {
    const disconnect = vi.spyOn(live, 'disconnect');
    http.get('/api/me').subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne('/api/me').flush('nope', { status: 401, statusText: 'Unauthorized' });

    // Still treated as the (expected) anonymous probe — session untouched here.
    expect(disconnect).not.toHaveBeenCalled();
    expect(session.user()).not.toBeNull();
  });

  it('re-throws the error so per-view error handling still runs', () => {
    let caught: unknown = null;
    http.get('/api/rollouts').subscribe({ next: () => {}, error: (e) => (caught = e) });
    httpMock
      .expectOne('/api/rollouts')
      .flush('boom', { status: 401, statusText: 'Unauthorized' });
    expect(caught).not.toBeNull();
  });
});
