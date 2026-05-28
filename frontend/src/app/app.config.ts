import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { SessionStore } from './core/auth/session.store';
import { LiveService } from './core/live.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideAppInitializer(async () => {
      const session = inject(SessionStore);
      const live = inject(LiveService);
      await session.load();
      // Only open the live channel for authenticated users; anonymous users
      // see the shell's "Sign in" affordance and don't need the socket. The
      // live channel is non-essential, so a failure to start it must never
      // block app bootstrap.
      try {
        if (session.user()) {
          live.connect();
        }
      } catch {
        /* degrade to offline; the indicator will show "Offline" */
      }
    }),
  ],
};
