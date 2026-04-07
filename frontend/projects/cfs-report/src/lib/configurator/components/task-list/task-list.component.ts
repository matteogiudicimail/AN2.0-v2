import { Component, OnInit } from '@angular/core';
import { TaskService } from '../../services/task.service';
import { TaskDef } from '../../models/configurator.models';

@Component({
  selector: 'cfg-task-list',
  templateUrl: './task-list.component.html',
})
export class TaskListComponent implements OnInit {
  tasks: TaskDef[]         = [];
  isLoading                = false;
  errorMsg: string | null  = null;

  constructor(private taskSvc: TaskService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.isLoading = true;
    this.errorMsg  = null;
    this.taskSvc.listTasks().subscribe({
      next:  (t) => { this.tasks = t; this.isLoading = false; },
      error: (err) => { this.errorMsg = 'Error loading tasks.'; this.isLoading = false; console.error(err); },
    });
  }

  activate(task: TaskDef): void {
    if (!confirm(`Activate "${task.label}"?`)) return;
    this.taskSvc.activateTask(task.taskId).subscribe({
      next:  () => this.load(),
      error: (err) => { this.errorMsg = 'Could not activate.'; console.error(err); },
    });
  }

  archive(task: TaskDef): void {
    if (!confirm(`Archive "${task.label}"?`)) return;
    this.taskSvc.archiveTask(task.taskId).subscribe({
      next:  () => this.load(),
      error: (err) => { this.errorMsg = 'Could not archive.'; console.error(err); },
    });
  }

  trackById(_: number, t: TaskDef): number { return t.taskId; }
}
