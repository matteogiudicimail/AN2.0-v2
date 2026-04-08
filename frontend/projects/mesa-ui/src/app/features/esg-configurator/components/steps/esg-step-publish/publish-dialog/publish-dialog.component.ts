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
  fieldName: string;
  label:     string;
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
      menu:   this.svc.getMenuTree().pipe(catchError(() => of([] as MenuTreeNode[]))),
      layout: this.svc.getEntryLayout(this.reportId).pipe(catchError(() => of(null))),
    }).subscribe(({ menu, layout }) => {
      this.menuItems = this.flattenMenuTree(menu, 0);

      if (layout) {
        this.filterFields = (layout.config as EntryLayoutConfig).filters.map((f) => ({
          fieldName: f.fieldName,
          label:     f.label,
        }));
        // Pre-populate from saved task
        if (this.task?.defaultFilters) {
          try {
            const saved = JSON.parse(this.task.defaultFilters) as Record<string, string>;
            this.defaultFilterValues = { ...saved };
          } catch {
            this.defaultFilterValues = {};
          }
        } else {
          this.filterFields.forEach((f) => { this.defaultFilterValues[f.fieldName] = ''; });
        }
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

  trackByField(_: number, f: FilterField): string { return f.fieldName; }
}
