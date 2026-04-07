import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { WritebackRequest, WritebackResponse, AuditEntry, CellDetailResponse } from '../models/writeback.models';
import { CellCoordinates } from '../models/report.models';

@Injectable({ providedIn: 'root' })
export class WritebackService {
  constructor(private api: ApiService) {}

  saveDelta(request: WritebackRequest): Observable<WritebackResponse> {
    return this.api.post<WritebackResponse>('/writeback/save', request);
  }

  revertDelta(deltaId: number): Observable<void> {
    return this.api.post<void>('/writeback/revert', { deltaId });
  }

  getCellHistory(coordinates: CellCoordinates): Observable<AuditEntry[]> {
    return this.api.post<AuditEntry[]>('/audit/cell-history', { coordinates });
  }

  getCellDetail(coordinates: CellCoordinates): Observable<CellDetailResponse> {
    return this.api.post<CellDetailResponse>('/audit/cell-detail', { coordinates });
  }
}
