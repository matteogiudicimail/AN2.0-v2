import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  TrackByFunction,
} from '@angular/core';
import {
  CellChange,
  GridCellValue,
  GridColumn,
  GridResponse,
  GridRow,
  GridSubSection,
  ValidationWarning,
} from '../../../../core/models/grid.model';
import { parseItalianNumber } from '../../../../shared/pipes/italian-number.pipe';

@Component({
  selector: 'app-data-grid',
  templateUrl: './data-grid.component.html',
  styleUrls: ['./data-grid.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataGridComponent implements OnChanges {
  @Input() gridData: GridResponse | null = null;
  @Input() dirtyKeys = new Set<string>(); // "kpiId-dimValId" keys
  @Input() warnings: ValidationWarning[] = [];
  /** When set, only columns whose id is in this set are rendered */
  @Input() visibleColumnIds: Set<number> | null = null;

  private get warningMap(): Map<string, ValidationWarning> {
    const m = new Map<string, ValidationWarning>();
    for (const w of this.warnings) {
      if (w.dimensionValueId) m.set(`${w.kpiId}-${w.dimensionValueId}`, w);
    }
    return m;
  }

  @Output() cellChanged = new EventEmitter<CellChange>();
  @Output() commentClicked = new EventEmitter<GridRow>();

  /** Track which sub-section bodies are collapsed */
  collapsedSections: boolean[] = [];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['gridData'] && this.gridData) {
      // Initialize collapse state — all open by default
      if (this.collapsedSections.length !== this.gridData.subSections.length) {
        this.collapsedSections = this.gridData.subSections.map(() => false);
      }
    }
  }

  toggleSubSection(idx: number): void {
    this.collapsedSections[idx] = !this.collapsedSections[idx];
    this.cdr.markForCheck();
  }

  // ---- Formatting ----

  formatValue(value: number | null, isEmpty: boolean): string {
    if (value === null || value === undefined) return '0,00';
    if (isEmpty && value === 0) return '0,00';
    return value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Returns CSS classes for a value input */
  cellClass(row: GridRow, cell: GridCellValue): string {
    const key = `${row.kpiId}-${cell.dimensionValueId}`;
    const classes: string[] = [];
    if (row.isCalculated) classes.push('calc');
    if (cell.isEmpty) classes.push('empty');
    if (this.dirtyKeys.has(key)) classes.push('dirty');
    const w = this.warningMap.get(key);
    if (w) classes.push(w.severity === 'ERROR' ? 'cell-error' : 'cell-warn');
    return classes.join(' ');
  }

  cellTitle(row: GridRow, cell: GridCellValue): string {
    const key = `${row.kpiId}-${cell.dimensionValueId}`;
    return this.warningMap.get(key)?.message ?? '';
  }

  colLabel(cell: GridCellValue): string {
    const col = this.gridData?.columns.find(c => c.id === cell.dimensionValueId);
    return col?.code ?? '';
  }

  // ---- Edit events ----

  onCellBlur(event: Event, row: GridRow, cell: GridCellValue): void {
    if (row.isCalculated) return;
    const input = event.target as HTMLInputElement;
    const parsed = parseItalianNumber(input.value);
    input.value = this.formatValue(parsed, parsed === null || parsed === 0);
    this.cellChanged.emit({
      kpiId: row.kpiId,
      dimensionValueId: cell.dimensionValueId,
      numericValue: parsed,
      source: 'MANUAL',
    });
  }

  onCellFocus(event: Event, row: GridRow, cell: GridCellValue): void {
    if (row.isCalculated) return;
    const input = event.target as HTMLInputElement;
    if (cell.numericValue !== null) {
      input.value = cell.numericValue.toString().replace('.', ',');
    } else {
      input.value = '';
    }
    input.select();
  }

  onCellKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      const inputs = document.querySelectorAll<HTMLInputElement>('.vc input:not([readonly])');
      const arr = Array.from(inputs);
      const idx = arr.indexOf(event.target as HTMLInputElement);
      if (idx >= 0 && idx < arr.length - 1) arr[idx + 1].focus();
    }
  }

  /** Filtered columns array based on visibleColumnIds */
  get visibleColumns(): GridColumn[] {
    if (!this.gridData) return [];
    if (!this.visibleColumnIds) return this.gridData.columns;
    return this.gridData.columns.filter(c => this.visibleColumnIds!.has(c.id));
  }

  /** Returns only the cell values for visible columns */
  visibleCells(row: GridRow): GridCellValue[] {
    if (!this.visibleColumnIds) return row.values;
    return row.values.filter(v => this.visibleColumnIds!.has(v.dimensionValueId));
  }

  // ---- Track-by functions for performance ----
  trackBySubSection: TrackByFunction<GridSubSection> = (_, ss) => ss.code;
  trackByColumn: TrackByFunction<GridColumn> = (_, col) => col.id;
  trackByRow: TrackByFunction<GridRow> = (_, row) => row.kpiId;
  trackByCell: TrackByFunction<GridCellValue> = (_, cell) => cell.dimensionValueId;
}
