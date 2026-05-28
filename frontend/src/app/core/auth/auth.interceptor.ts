import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { SessionStore } from './session.store';
import { LiveService } from '../live.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionStore);
  const live = inject(LiveService);
  const apiReq = req.clone({ withCredentials: true });
  return next(apiReq).pipe(
    catchError((err: unknown) => {
      // If the session expires mid-use, a 401 would otherwise be swallowed by
      // each view's catchError → silent blank screen, while the live channel
      // loops forever on "Reconnecting…". Instead, degrade to the anonymous
      // state so the shell shows its "Sign in" link and the socket stops.
      //
      // Skip the `/api/me` probe (expected to 401 for anonymous, handled by the
      // SessionStore) and `/auth/*`, and only act when a session actually
      // existed — so this never fires during normal anonymous bootstrap.
      const path = req.url.split(/[?#]/)[0];
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        session.user() !== null &&
        !path.endsWith('/api/me') &&
        !path.includes('/auth/')
      ) {
        session.clear();
        live.disconnect();
      }
      return throwError(() => err);
    }),
  );
};
