/**
 * EsgTaskPageComponent — full-page view for a published ESG task.
 *
 * Loads the active snapshot for the given taskId and renders it using
 * SnapshotViewerComponent. The snapshot is the immutable artifact frozen
 * at publication time; later configurator edits do not affect it until
 * an explicit republish.
 */

import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { EsgConfiguratorService } from '../../esg-configurator/services/esg-configurator.service';

@Component({
  selector:    'app-esg-task-page',
  templateUrl: './esg-task-page.component.html',
})
export class EsgTaskPageComponent implements OnChanges {
  /** The published task to display. */
  @Input() taskId:    number | null = null;
  @Input() taskLabel = '';

  snapshotId: number | null = null;
  loading  = false;
  errorMsg: string | null = null;

  constructor(private svc: EsgConfiguratorService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['taskId'] && this.taskId) {
      this.load(this.taskId);
    }
  }

  private load(taskId: number): void {
    this.loading    = true;
    this.errorMsg   = null;
    this.snapshotId = null;

    this.svc.getActiveSnapshot(taskId).subscribe({
      next:  (snap) => { this.snapshotId = snap.snapshotId; this.loading = false; },
      error: ()     => {
        this.errorMsg = 'Report non disponibile: snapshot non trovato o non ancora creato.';
        this.loading  = false;
      },
    });
  }
}
