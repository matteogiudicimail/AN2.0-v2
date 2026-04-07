import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import {
  Entity, Process, Scope, AdjLevel, Currency, CostCenter, CO, Counterpart,
} from '../models/dimension.models';

@Injectable({ providedIn: 'root' })
export class DimensionService {
  constructor(private api: ApiService) {}

  getEntities(): Observable<Entity[]> {
    return this.api.get<Entity[]>('/dimensions/entities');
  }

  getProcesses(): Observable<Process[]> {
    return this.api.get<Process[]>('/dimensions/processes');
  }

  getScopes(): Observable<Scope[]> {
    return this.api.get<Scope[]>('/dimensions/scopes');
  }

  getAdjLevels(scopeId: number): Observable<AdjLevel[]> {
    return this.api.get<AdjLevel[]>(`/dimensions/scopes/${scopeId}/adj-levels`);
  }

  getCurrencies(): Observable<Currency[]> {
    return this.api.get<Currency[]>('/dimensions/currencies');
  }

  getCostCenters(): Observable<CostCenter[]> {
    return this.api.get<CostCenter[]>('/dimensions/cost-centers');
  }

  getCOs(): Observable<CO[]> {
    return this.api.get<CO[]>('/dimensions/cos');
  }

  getCounterparts(): Observable<Counterpart[]> {
    return this.api.get<Counterpart[]>('/dimensions/counterparts');
  }
}
