/**
 * Step 4 — Task generation (seaside system).
 * Uses backend model: taskCode + label (not title).
 * contextFilters stored as Record<string,unknown> (JSON object).
 */
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TaskService } from '../../../../services/task.service';
import { TaskDef, CreateTaskDto, UpdateTaskDto, WritebackMode } from '../../../../models/configurator.models';

@Component({
  selector: 'cfg-step-tasks',
  templateUrl: './step-tasks.component.html',
})
export class StepTasksComponent implements OnInit {
  @Input() reportId!: number;
  @Output() back   = new EventEmitter<void>();
  @Output() finish = new EventEmitter<void>();

  tasks:      TaskDef[] = [];
  isLoading   = false;
  isSaving    = false;
  errorMsg:   string | null = null;
  successMsg: string | null = null;
  editingTaskId: number | null = null;
  showForm = false;
  contextFiltersError = '';

  form: FormGroup;

  constructor(
    private taskSvc: TaskService,
    private fb: FormBuilder,
    private router: Router,
  ) {
    this.form = this.fb.group({
      taskCode:       ['', [Validators.required, Validators.maxLength(50), Validators.pattern(/^[a-zA-Z0-9_-]+$/)]],
      label:          ['', [Validators.required, Validators.maxLength(200)]],
      description:    [''],
      writebackMode:  [''],
      contextFilters: [''],
      routeUrl:       [''],
      menuItemCode:   [''],
      dueDate:        [''],
      assignedRole:   [''],
    });
  }

  ngOnInit(): void { this.loadTasks(); }

  private loadTasks(): void {
    this.isLoading = true;
    this.taskSvc.listTasks(this.reportId).subscribe({
      next:  (t) => { this.tasks = t; this.isLoading = false; },
      error: (err) => { this.errorMsg = 'Could not load tasks.'; this.isLoading = false; console.error(err); },
    });
  }

  openNew(): void {
    this.editingTaskId = null;
    this.form.reset({ writebackMode: '' });
    this.form.get('taskCode')!.enable();
    this.contextFiltersError = '';
    this.showForm = true;
  }

  editTask(task: TaskDef): void {
    this.editingTaskId = task.taskId;
    this.form.patchValue({
      taskCode:       task.taskCode,
      label:          task.label,
      description:    task.description ?? '',
      writebackMode:  task.writebackMode ?? '',
      contextFilters: task.contextFilters ? JSON.stringify(task.contextFilters, null, 2) : '',
      routeUrl:       task.routeUrl ?? '',
      menuItemCode:   task.menuItemCode ?? '',
      dueDate:        '',
      assignedRole:   task.allowedRoles ?? '',
    });
    this.form.get('taskCode')!.disable(); // code immutable after creation
    this.contextFiltersError = '';
    this.showForm = true;
  }

  private parseContextFilters(raw: string): Record<string, unknown> | undefined {
    this.contextFiltersError = '';
    if (!raw?.trim()) return undefined;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this.contextFiltersError = 'Context filters must be valid JSON.';
      return undefined;
    }
  }

  saveTask(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const contextFilters = this.parseContextFilters(v.contextFilters);
    if (this.contextFiltersError) return;

    this.isSaving   = true;
    this.errorMsg   = null;
    this.successMsg = null;

    const base = {
      label:          v.label.trim(),
      description:    v.description?.trim() || undefined,
      writebackMode:  v.writebackMode || undefined,
      contextFilters: contextFilters,
      routeUrl:       v.routeUrl?.trim()     || undefined,
      menuItemCode:   v.menuItemCode?.trim() || undefined,
      allowedRoles:   v.assignedRole?.trim() || undefined,
    };

    if (this.editingTaskId) {
      this.taskSvc.updateTask(this.editingTaskId, base as UpdateTaskDto).subscribe({
        next: () => this.afterSave(),
        error: (err) => { this.errorMsg = 'Could not save task.'; this.isSaving = false; console.error(err); },
      });
    } else {
      const dto: CreateTaskDto = { ...base, taskCode: v.taskCode.trim(), reportId: this.reportId };
      this.taskSvc.createTask(dto).subscribe({
        next: () => this.afterSave(),
        error: (err) => { this.errorMsg = 'Could not save task.'; this.isSaving = false; console.error(err); },
      });
    }
  }

  private afterSave(): void {
    this.isSaving = false; this.showForm = false; this.successMsg = 'Task saved.'; this.loadTasks();
  }

  activate(task: TaskDef): void {
    if (!confirm(`Activate task "${task.label}"? It will appear in the MG menu.`)) return;
    this.taskSvc.activateTask(task.taskId).subscribe({
      next:  () => this.loadTasks(),
      error: (err) => { this.errorMsg = 'Could not activate task.'; console.error(err); },
    });
  }

  /** Naviga alla griglia dati del task (resta nell'iframe, non apre una nuova scheda). */
  openTask(task: TaskDef): void {
    const url = task.routeUrl ?? `/task/${task.taskId}`;
    this.router.navigateByUrl(url);
  }

  archiveTask(task: TaskDef): void {
    if (!confirm(`Archive task "${task.label}"?`)) return;
    this.taskSvc.archiveTask(task.taskId).subscribe({
      next:  () => this.loadTasks(),
      error: (err) => { this.errorMsg = 'Could not archive task.'; console.error(err); },
    });
  }

  cancelForm(): void { this.showForm = false; this.editingTaskId = null; }
  trackById(_: number, t: TaskDef): number { return t.taskId; }
}
