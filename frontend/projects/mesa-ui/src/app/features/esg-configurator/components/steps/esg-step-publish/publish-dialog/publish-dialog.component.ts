import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { EsgConfiguratorService } from '../../../../services/esg-configurator.service';
import {
  TaskSummary, UpsertTaskDto, MenuTreeNode, EntryLayoutConfig,
} from '../../../../models/esg-configurator.models';
import { SearchableSelectItem } from '../../../shared/cfg-searchable-select/cfg-searchable-select.component';

interface FilterField {
  fieldName:      string;
  label:          string;
  dimTable?:      string | null;
  defaultValue?:  string | null;
  options:        string[];
  optionsLoading: boolean;
  optionsError:   string | null;
}

@Component({
  selector: 'publish-dialog',
  templateUrl: './publish-dialog.component.html',
})
export class PublishDialogComponent implements OnInit {
  @Input() reportId!: number;
  @Input() task: TaskSummary | null = null;   // null → new task

  @Output() saved     = new EventEmitter<TaskSummary>();
  @Output() cancelled = new EventEmitter<void>();

  form!: FormGroup;

  isLoading = true;
  isSaving  = false;
  errorMsg: string | null = null;

  menuItems: SearchableSelectItem[] = [];
  filterFields: FilterField[] = [];

  /** key → user-entered default value */
  defaultFilterValues: Record<string, string> = {};

  /** Set of filter field names the admin wants to hide from the user */
  hiddenFilterFields = new Set<string>();

  get isNew(): boolean { return this.task === null; }

  constructor(private svc: EsgConfiguratorService, private fb: FormBuilder) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      label:          [this.task?.label ?? '',   Validators.required],
      description:    [''],
      parentMenuCode: [this.task?.parentMenuCode ?? ''],
      menuItemCode:   [this.task?.menuItemCode  ?? ''],
      accessReaders:  [this.task?.accessReaders  ?? ''],
      accessWriters:  [this.task?.accessWriters  ?? ''],
    });

    forkJoin({
      menu:    this.svc.getMenuTree().pipe(catchError(() => of([] as MenuTreeNode[]))),
      layout:  this.svc.getEntryLayout(this.reportId).pipe(catchError(() => of(null))),
      binding: this.svc.getBinding(this.reportId).pipe(catchError(() => of(null))),
    }).subscribe(({ menu, layout, binding }) => {
      this.menuItems = this.flattenMenuTree(menu, 0);

      if (layout) {
        const cfg = layout.config as EntryLayoutConfig;
        this.filterFields = cfg.filters.map((f) => ({
          fieldName:      f.fieldName,
          label:          f.label,
          dimTable:       f.dimTable ?? null,
          defaultValue:   f.defaultValue ?? null,
          options:        [],
          optionsLoading: true,
          optionsError:   null,
        }));

        // Pre-populate: saved task values take priority, else layout defaultValue
        if (this.task?.defaultFilters) {
          try {
            const saved = JSON.parse(this.task.defaultFilters) as Record<string, string>;
            this.defaultFilterValues = { ...saved };
          } catch {
            this.filterFields.forEach((f) => { this.defaultFilterValues[f.fieldName] = f.defaultValue ?? ''; });
          }
        } else {
          this.filterFields.forEach((f) => { this.defaultFilterValues[f.fieldName] = f.defaultValue ?? ''; });
        }

        // Pre-populate hidden filter flags
        if (this.task?.hiddenFilters) {
          try {
            const hidden = JSON.parse(this.task.hiddenFilters) as string[];
            this.hiddenFilterFields = new Set(hidden);
          } catch { /* ignore */ }
        }

        // Load distinct options for each filter field
        const factTable = binding?.factTable ?? '';
        this.filterFields.forEach((f) => {
          const ctx = this.resolveDistinctContext(f, factTable);
          if (!ctx) {
            f.optionsLoading = false;
            return;
          }
          this.svc.getDistinctValues(ctx.schema, ctx.table, ctx.column, 500).subscribe({
            next:  (r) => { f.options = r.values ?? []; f.optionsLoading = false; },
            error: ()  => { f.optionsError = 'Impossibile caricare i valori.'; f.optionsLoading = false; },
          });
        });
      }
      this.isLoading = false;
    });
  }

  private flattenMenuTree(nodes: MenuTreeNode[], depth: number): SearchableSelectItem[] {
    const items: SearchableSelectItem[] = [];
    for (const n of nodes) {
      items.push({
        value: n.code,
        label: ('  '.repeat(depth)) + n.label,
        badge: depth === 0 ? 'root' : undefined,
      });
      items.push(...this.flattenMenuTree(n.children, depth + 1));
    }
    return items;
  }

  onParentMenuChange(value: string | null): void {
    this.form.patchValue({ parentMenuCode: value ?? '' });
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    const v = this.form.value;
    const dto: UpsertTaskDto = {
      label:          v.label.trim(),
      description:    v.description?.trim() || undefined,
      parentMenuCode: v.parentMenuCode || undefined,
      menuItemCode:   v.menuItemCode?.trim() || undefined,
      accessReaders:  v.accessReaders?.trim() || undefined,
      accessWriters:  v.accessWriters?.trim() || undefined,
      defaultFilters: this.buildDefaultFiltersJson(),
      hiddenFilters:  this.buildHiddenFiltersJson(),
    };

    this.isSaving = true;
    this.errorMsg = null;

    const call$ = this.isNew
      ? this.svc.createTask(this.reportId, dto)
      : this.svc.updateTask(this.task!.taskId, dto);

    call$.subscribe({
      next:  (saved) => { this.isSaving = false; this.saved.emit(saved); },
      error: ()      => { this.errorMsg = 'Could not save. Please try again.'; this.isSaving = false; },
    });
  }

  private buildDefaultFiltersJson(): string | undefined {
    const result: Record<string, string> = {};
    let hasValue = false;
    for (const [k, v] of Object.entries(this.defaultFilterValues)) {
      if (v?.trim()) { result[k] = v.trim(); hasValue = true; }
    }
    return hasValue ? JSON.stringify(result) : undefined;
  }

  private buildHiddenFiltersJson(): string {
    return JSON.stringify([...this.hiddenFilterFields]);
  }

  toggleHiddenFilter(fieldName: string): void {
    if (this.hiddenFilterFields.has(fieldName)) {
      this.hiddenFilterFields.delete(fieldName);
    } else {
      this.hiddenFilterFields.add(fieldName);
    }
  }

  trackByField(_: number, f: FilterField): string { return f.fieldName; }

  private resolveDistinctContext(
    f: FilterField, factTable: string,
  ): { schema: string; table: string; column: string } | null {
    const splitFact = (t: string): [string, string] => {
      if (!t) return ['dbo', ''];
      const dot = t.lastIndexOf('.');
      return dot >= 0 ? [t.slice(0, dot), t.slice(dot + 1)] : ['dbo', t];
    };
    if (f.dimTable) {
      const [s, t] = splitFact(f.dimTable);
      return { schema: s, table: t, column: f.fieldName };
    }
    if (factTable) {
      const [s, t] = splitFact(factTable);
      return { schema: s, table: t, column: f.fieldName };
    }
    return null;
  }
}
