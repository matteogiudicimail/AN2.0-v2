import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, EMPTY, Subject, Subscription } from 'rxjs';
import { catchError, debounceTime, retry, switchMap, tap } from 'rxjs/operators';
import { ApiService } from '../../../core/services/api.service';
import { CellChange, GridResponse, SaveCellsResponse, SaveState } from '../../../core/models/grid.model';

@Injectable()
export class CellEditService implements OnDestroy {
  private reportId!: number;
  private sectionId!: number;

  /** Pending changes keyed by "kpiId-dimValId" — newer changes overwrite older ones */
  private pendingChanges = new Map<string, CellChange>();

  private saveSubject = new Subject<void>();
  private saveState$$ = new BehaviorSubject<SaveState>('idle');
  private lastSaved$$ = new BehaviorSubject<Date | null>(null);

  readonly saveState$ = this.saveState$$.asObservable();
  readonly lastSaved$ = this.lastSaved$$.asObservable();

  private sub: Subscription;

  constructor(private api: ApiService) {
    this.sub = this.saveSubject.pipe(
      debounceTime(1000), // 1s debounce — satisfies 800-1200ms requirement
      switchMap(() => this.flushChanges()),
    ).subscribe();
  }

  init(reportId: number, sectionId: number): void {
    this.reportId = reportId;
    this.sectionId = sectionId;
    this.pendingChanges.clear();
    this.saveState$$.next('idle');
  }

  markDirty(change: CellChange): void {
    const key = `${change.kpiId}-${change.dimensionValueId}`;
    this.pendingChanges.set(key, change);
    this.saveSubject.next();
  }

  /** Force-flush immediately (e.g. on "Save draft" button) */
  flush(): void {
    this.saveSubject.next();
  }

  private flushChanges() {
    if (this.pendingChanges.size === 0) return EMPTY;

    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();
    this.saveState$$.next('saving');

    return this.api.post<SaveCellsResponse>(
      `/reports/${this.reportId}/sections/${this.sectionId}/cells`,
      { changes },
    ).pipe(
      tap((res) => {
        this.saveState$$.next('saved');
        this.lastSaved$$.next(new Date());
        // Return to idle after 2s
        setTimeout(() => {
          if (this.saveState$$.value === 'saved') this.saveState$$.next('idle');
        }, 2000);

        // Re-apply recalculated parent values to pending if any came back
        if (res.recalculated?.length) {
          // signal to grid — handled via the response stored in a shared subject
          this.recalculated$$.next(res.recalculated);
        }
      }),
      retry({ count: 2, delay: 1500 }),
      catchError(() => {
        // Re-add failed changes so they get retried on next edit
        changes.forEach(c => {
          const key = `${c.kpiId}-${c.dimensionValueId}`;
          if (!this.pendingChanges.has(key)) {
            this.pendingChanges.set(key, c);
          }
        });
        this.saveState$$.next('error');
        return EMPTY;
      }),
    );
  }

  /** Emits recalculated parent KPI values from the server */
  readonly recalculated$$ = new Subject<{ kpiId: number; dimensionValueId: number; numericValue: number }[]>();
  readonly recalculated$ = this.recalculated$$.asObservable();

  /**
   * Applies a cell change optimistically to the in-memory grid data.
   * Also recalculates parent SUM rows for the affected column.
   */
  applyOptimistic(
    grid: GridResponse,
    kpiId: number,
    dimensionValueId: number,
    newValue: number | null,
  ): GridResponse {
    // Deep-clone the subSections array (rows are mutable objects — clone values array)
    const updated = {
      ...grid,
      subSections: grid.subSections.map(ss => ({
        ...ss,
        rows: ss.rows.map(row => {
          if (row.kpiId !== kpiId) return row;
          return {
            ...row,
            values: row.values.map(v =>
              v.dimensionValueId === dimensionValueId
                ? { ...v, numericValue: newValue, isEmpty: newValue === null || newValue === 0 }
                : v,
            ),
          };
        }),
      })),
    };

    // Recalculate parent SUM rows for the affected dimensionValueId
    return this.recalculateSums(updated, dimensionValueId);
  }

  private recalculateSums(grid: GridResponse, dimensionValueId: number): GridResponse {
    // Flat list of all rows
    const allRows = grid.subSections.flatMap(ss => ss.rows);

    // Find parent rows (isBold + isCalculated)
    const parentRows = allRows.filter(r => r.isCalculated && r.isBold);

    for (const parent of parentRows) {
      // All child rows are those that are NOT calculated and belong to the same sub-section
      // In the current model, children share the same subSection and have indentLevel=1
      const parentSS = grid.subSections.find(ss => ss.rows.includes(parent));
      if (!parentSS) continue;

      const children = parentSS.rows.filter(r => !r.isCalculated && r.indentLevel > 0);
      if (!children.length) continue;

      const colIdx = parent.values.findIndex(v => v.dimensionValueId === dimensionValueId);
      if (colIdx === -1) continue;

      const childVals = children
        .map(child => child.values[colIdx]?.numericValue)
        .filter((v): v is number => v !== null);

      let computed = 0;
      if (parent.formulaTag?.startsWith('= media')) {
        computed = childVals.length ? childVals.reduce((a, b) => a + b, 0) / childVals.length : 0;
      } else if (parent.formulaTag?.startsWith('= rapporto')) {
        computed = childVals.length >= 2 && childVals[1] !== 0 ? (childVals[0] / childVals[1]) * 100 : 0;
      } else {
        computed = childVals.reduce((a, b) => a + b, 0); // SUM default
      }

      parent.values[colIdx] = {
        ...parent.values[colIdx],
        numericValue: computed,
        isEmpty: computed === 0,
      };
    }

    return grid;
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
