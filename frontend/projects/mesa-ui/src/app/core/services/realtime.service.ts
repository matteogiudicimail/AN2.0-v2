import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';

export interface CellSavedEvent {
  reportId: number;
  sectionId: number;
  kpiId: number;
  dimensionValueId: number;
  numericValue: number | null;
  userId: number;
}

export interface StatusChangedEvent {
  reportId: number;
  status: string;
}

@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  private socket: Socket | null = null;

  readonly cellSaved$ = new Subject<CellSavedEvent>();
  readonly statusChanged$ = new Subject<StatusChangedEvent>();

  connect(): void {
    if (this.socket?.connected) return;

    const wsUrl = environment.apiUrl.replace('/api', '');
    this.socket = io(`${wsUrl}/realtime`, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    this.socket.on('cellSaved', (data: CellSavedEvent) => this.cellSaved$.next(data));
    this.socket.on('statusChanged', (data: StatusChangedEvent) => this.statusChanged$.next(data));
  }

  joinRoom(reportId: number, sectionId: number, userId: number): void {
    this.connect();
    this.socket?.emit('join', { reportId, sectionId, userId });
  }

  leaveRoom(reportId: number, sectionId: number, userId: number): void {
    this.socket?.emit('leave', { reportId, sectionId, userId });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
