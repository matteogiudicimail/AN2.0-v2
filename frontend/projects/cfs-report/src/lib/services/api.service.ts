/**
 * HTTP client wrapper — injects JWT from InputData into every request.
 * OWASP A02: token never stored in localStorage; comes from host InputData.
 */
import { Injectable, Inject, Optional } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CFS_CONFIG, Configuration } from '../cfs-config.token';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = '/api'; // proxied to backend in dev
  private _token = '';

  constructor(
    private http: HttpClient,
    @Optional() @Inject(CFS_CONFIG) config: Configuration | null,
  ) {
    if (config?.apiBaseUrl) {
      this.baseUrl = config.apiBaseUrl;
    }
  }

  /** Called once by CfsReportModule.forRoot() with the token from InputData */
  setToken(token: string): void {
    this._token = token;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this._token}`,
    });
  }

  get<T>(path: string): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}${path}`, { headers: this.headers() });
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body, { headers: this.headers() });
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${path}`, body, { headers: this.headers() });
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${path}`, body, { headers: this.headers() });
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${path}`, { headers: this.headers() });
  }
}
