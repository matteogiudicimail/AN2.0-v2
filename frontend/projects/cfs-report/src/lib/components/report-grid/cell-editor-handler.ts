/**
 * Cell Editor Handler — orchestrates the writeback save flow.
 * Called by ReportContainerComponent after a cell edit or annotation dialog completes.
 */
import { Injectable } from '@angular/core';
import { WritebackService } from '../../services/writeback.service';
import { WritebackRequest, WritebackResponse, ConflictInfo } from '../../models/writeback.models';
import { CellCoordinates } from '../../models/report.models';
import { FilterState } from '../../models/filter-state.model';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface SaveResult {
  success: boolean;
  conflict?: ConflictInfo;
  processLocked?: boolean;
  errorMessage?: string;
}

@Injectable()
export class CellEditorHandler {
  constructor(private writebackSvc: WritebackService) {}

  /**
   * Build the request by merging cell coordinates with the current filter state.
   * Filter state provides entityId, scopeId, currencyId context.
   */
  buildRequest(
    coordinates: CellCoordinates,
    newValue: number,
    annotation: string,
    currentVersion: number,
    filterState: FilterState,
    parentRclKey?: string,
  ): WritebackRequest {
    const colDim = filterState.columnDimension ?? 'Process';

    let loadId: number;
    let entityId: number;
    let adjLevelId: number | undefined;

    if (colDim === 'Entity') {
      // Column key = entityId; process comes from filter
      loadId     = filterState.loadIds[0];
      entityId   = coordinates.loadId;       // loadId slot holds the entity column key
      adjLevelId = coordinates.adjLevelId;
    } else if (colDim === 'AdjLevel') {
      // Column key = adjLevelId; process and entity come from filter
      loadId     = filterState.loadIds[0];
      entityId   = filterState.entityIds[0];
      adjLevelId = coordinates.loadId;       // loadId slot holds the adj-level column key
    } else {
      // Default Process mode
      loadId     = coordinates.loadId;
      entityId   = filterState.entityIds[0];
      adjLevelId = coordinates.adjLevelId;
    }

    return {
      rclAccountKey: coordinates.rclAccountKey,
      loadId,
      entityId,
      scopeId:    filterState.scopeId,
      currencyId: filterState.currencyId,
      adjLevelId,
      newValue,
      annotation,
      currentVersion,
      parentRclKey,
    };
  }

  /** Returns an observable that resolves to a SaveResult */
  save(request: WritebackRequest): Observable<SaveResult> {
    return this.writebackSvc.saveDelta(request).pipe(
      map((_resp: WritebackResponse): SaveResult => ({ success: true })),
      catchError((err) => {
        if (err?.status === 409) {
          const body = err?.error ?? {};
          if (body?.conflict) {
            return [{ success: false, conflict: body.conflict as ConflictInfo }];
          }
          if (body?.processLocked) {
            return [{ success: false, processLocked: true }];
          }
        }
        return throwError(() => ({
          success: false,
          errorMessage: 'Save failed. Please try again.',
        }));
      }),
    ) as Observable<SaveResult>;
  }
}
