import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { EsgConfiguratorService } from '../../../services/esg-configurator.service';

@Component({
  selector: 'lock-members-dialog',
  templateUrl: './lock-members-dialog.component.html',
})
export class LockMembersDialogComponent implements OnInit {
  /** Schema name of the source table (e.g. 'dbo') */
  @Input() schemaName!: string;
  /** Table name to fetch distinct values from */
  @Input() tableName!: string;
  /** Column name whose distinct values are loaded */
  @Input() columnName!: string;
  /** Currently locked member values — pre-checked on open */
  @Input() currentLocked: string[] = [];
  /** Field label shown in dialog title */
  @Input() fieldLabel = '';

  /** Emits the final selected locked values on confirm */
  @Output() saved    = new EventEmitter<string[]>();
  @Output() cancelled = new EventEmitter<void>();

  distinctValues: string[] = [];
  checkedValues  = new Set<string>();
  searchText     = '';
  isLoading      = true;
  errorMsg: string | null = null;

  constructor(private svc: EsgConfiguratorService) {}

  ngOnInit(): void {
    this.checkedValues = new Set(this.currentLocked);
    this.svc.getDistinctValues(this.schemaName, this.tableName, this.columnName, 1000)
      .subscribe({
        next: (r) => { this.distinctValues = r.values ?? []; this.isLoading = false; },
        error: ()  => { this.errorMsg = 'Could not load values.'; this.isLoading = false; },
      });
  }

  get filteredValues(): string[] {
    const q = this.searchText.trim().toLowerCase();
    return q
      ? this.distinctValues.filter(v => v.toLowerCase().includes(q))
      : this.distinctValues;
  }

  toggle(val: string): void {
    if (this.checkedValues.has(val)) this.checkedValues.delete(val);
    else this.checkedValues.add(val);
  }

  selectAll(): void   { this.filteredValues.forEach(v => this.checkedValues.add(v)); }
  deselectAll(): void { this.filteredValues.forEach(v => this.checkedValues.delete(v)); }

  confirm(): void { this.saved.emit([...this.checkedValues]); }

  isChecked(val: string): boolean { return this.checkedValues.has(val); }
}
