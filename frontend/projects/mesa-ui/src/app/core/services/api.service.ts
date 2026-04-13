import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = environment.apiUrl;

  // MVP fallback: header-based user ID (used when no JWT is present)
  private userId = 1;

  constructor(private http: HttpClient, private authService: AuthService) {}

  setUserId(id: number) { this.userId = id; }

  private headers(): HttpHeaders {
    const token = this.authService.token;
    if (token) {
      return new HttpHeaders({ Authorization: `Bearer ${token}` });
    }
    // Fallback to X-User-Id for backwards-compat
    return new HttpHeaders({ 'X-User-Id': String(this.userId) });
  }

  get<T>(path: string): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}${path}`, { headers: this.headers() });
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body, { headers: this.headers() });
  }

  getBlob(path: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}${path}`, {
      headers: this.headers(),
      responseType: 'blob',
    });
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${path}`, body, { headers: this.headers() });
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${path}`, body, { headers: this.headers() });
  }

  delete<T = void>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${path}`, { headers: this.headers() });
  }

  postFile<T>(path: string, file: File): Observable<T> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<T>(`${this.baseUrl}${path}`, fd, {
      headers: new HttpHeaders({ 'X-User-Id': String(this.userId) }),
    });
  }
}
