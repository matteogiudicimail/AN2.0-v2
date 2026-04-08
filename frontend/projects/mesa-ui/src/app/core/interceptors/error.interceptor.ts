import { Injectable } from '@angular/core';
import {
  HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(req).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.authService.logout();
          // Page will reload to login screen automatically via isLoggedIn guard
        } else if (err.status === 403) {
          console.warn('MESA: accesso negato', req.url);
        } else if (err.status >= 500) {
          console.error('MESA: errore server', err.status, req.url, err.error?.message);
        }
        return throwError(() => err);
      }),
    );
  }
}
