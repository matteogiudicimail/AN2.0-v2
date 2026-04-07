/**
 * TaskService — HTTP facade for /api/tasks endpoints.
 */
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { TaskDef, CreateTaskDto, UpdateTaskDto } from '../models/configurator.models';

@Injectable()
export class TaskService {
  private readonly base = '/tasks';

  constructor(private api: ApiService) {}

  listTasks(reportId?: number): Observable<TaskDef[]> {
    const qs = reportId ? `?reportId=${reportId}` : '';
    return this.api.get<TaskDef[]>(`${this.base}${qs}`);
  }

  getTask(taskId: number): Observable<TaskDef> {
    return this.api.get<TaskDef>(`${this.base}/${taskId}`);
  }

  createTask(dto: CreateTaskDto): Observable<TaskDef> {
    return this.api.post<TaskDef>(`${this.base}`, dto);
  }

  updateTask(taskId: number, dto: UpdateTaskDto): Observable<TaskDef> {
    return this.api.patch<TaskDef>(`${this.base}/${taskId}`, dto);
  }

  activateTask(taskId: number): Observable<void> {
    return this.api.post<void>(`${this.base}/${taskId}/activate`, {});
  }

  archiveTask(taskId: number): Observable<void> {
    return this.api.post<void>(`${this.base}/${taskId}/archive`, {});
  }
}
