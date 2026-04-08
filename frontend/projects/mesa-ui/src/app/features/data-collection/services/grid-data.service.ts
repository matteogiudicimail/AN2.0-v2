import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { GridResponse, Report, Section, User } from '../../../core/models/grid.model';

@Injectable({ providedIn: 'root' })
export class GridDataService {
  constructor(private api: ApiService) {}

  loadGrid(reportId: number, sectionId: number): Observable<GridResponse> {
    return this.api.get<GridResponse>(`/reports/${reportId}/sections/${sectionId}/grid`);
  }

  loadReports(): Observable<Report[]> {
    return this.api.get<Report[]>('/reports');
  }

  loadReport(reportId: number): Observable<Report> {
    return this.api.get<Report>(`/reports/${reportId}`);
  }

  loadSections(reportId: number): Observable<Section[]> {
    return this.api.get<Section[]>(`/reports/${reportId}/sections`);
  }

  loadMe(): Observable<User> {
    return this.api.get<User>('/me');
  }
}
