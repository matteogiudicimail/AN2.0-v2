import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ReportRequest, ReportResponse } from '../models/report.models';

@Injectable({ providedIn: 'root' })
export class ReportService {
  constructor(private api: ApiService) {}

  executeReport(request: ReportRequest): Observable<ReportResponse> {
    return this.api.post<ReportResponse>('/report/query', request);
  }
}
