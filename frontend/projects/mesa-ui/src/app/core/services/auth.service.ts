import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: { id: number; username: string; displayName: string; roles: string[] };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'mesa_jwt';
  private tokenSubject = new BehaviorSubject<string | null>(this.storedToken());

  readonly token$ = this.tokenSubject.asObservable();

  constructor(private http: HttpClient) {}

  get token(): string | null { return this.tokenSubject.value; }
  // Login module disabled for development — always "logged in"
  get isLoggedIn(): boolean { return true; }

  login(username: string, password: string): Observable<AuthToken> {
    return this.http.post<AuthToken>(`${environment.apiUrl}/auth/login`, { username, password }).pipe(
      tap((res) => {
        localStorage.setItem(this.TOKEN_KEY, res.access_token);
        this.tokenSubject.next(res.access_token);
      }),
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    this.tokenSubject.next(null);
  }

  private storedToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }
}
