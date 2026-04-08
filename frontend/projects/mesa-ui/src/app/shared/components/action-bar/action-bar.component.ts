import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SaveState } from '../../../core/models/grid.model';

@Component({
  selector: 'app-action-bar',
  templateUrl: './action-bar.component.html',
  styleUrls: ['./action-bar.component.scss'],
})
export class ActionBarComponent {
  @Input() saveState: SaveState = 'idle';
  @Input() canSubmit = true;
  @Input() reportStatus = 'DRAFT';
  @Input() lastSaved: Date | null = null;
  @Input() userRoles: string[] = [];

  @Output() downloadExcel = new EventEmitter<void>();
  @Output() uploadExcel = new EventEmitter<void>();
  @Output() saveDraft = new EventEmitter<void>();
  @Output() refresh = new EventEmitter<void>();
  @Output() submit = new EventEmitter<void>();
  @Output() submitReport = new EventEmitter<void>();
  @Output() approveReport = new EventEmitter<void>();
  @Output() rejectReport = new EventEmitter<void>();

  get isCoordinator(): boolean { return this.userRoles.includes('COORDINATOR') || this.userRoles.includes('ADMIN'); }
  get isContributor(): boolean { return this.userRoles.includes('CONTRIBUTOR') || this.userRoles.includes('ADMIN'); }

  get statusLabel(): string {
    const labels: Record<string, string> = {
      DRAFT: 'Bozza', SUBMITTED: 'In revisione', APPROVED: 'Approvato', REJECTED: 'Rifiutato',
    };
    return labels[this.reportStatus] ?? this.reportStatus;
  }

  get statusClass(): string {
    const cls: Record<string, string> = {
      DRAFT: 'status--draft', SUBMITTED: 'status--submitted',
      APPROVED: 'status--approved', REJECTED: 'status--rejected',
    };
    return cls[this.reportStatus] ?? '';
  }

  get saveLabel(): string {
    switch (this.saveState) {
      case 'saving': return 'Salvataggio...';
      case 'saved':  return 'Salvato';
      case 'error':  return 'Errore salvataggio';
      default:       return '';
    }
  }

  get saveClass(): string {
    switch (this.saveState) {
      case 'saving': return 'save-indicator--saving';
      case 'saved':  return 'save-indicator--saved';
      case 'error':  return 'save-indicator--error';
      default:       return '';
    }
  }
}
