/**
 * Cell Detail Dialog — shows base value + active adjustments + audit trail.
 *
 * WCAG 4.1.2 — role=dialog, aria-modal, aria-labelledby
 */
import {
  Component, Input, Output, EventEmitter, OnInit, ElementRef, ViewChild,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { WritebackService } from '../../services/writeback.service';
import { CellDetailResponse } from '../../models/writeback.models';
import { CellCoordinates } from '../../models/report.models';

@Component({
  selector: 'cfs-cell-history-dialog',
  templateUrl: './cell-history-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CellHistoryDialogComponent implements OnInit {
  @Input() coordinates!: CellCoordinates;
  @Input() cellLabel = '';
  @Output() closed = new EventEmitter<void>();

  @ViewChild('firstFocus', { static: true }) firstFocus!: ElementRef<HTMLElement>;

  detail: CellDetailResponse | null = null;
  isLoading = true;
  error = '';

  constructor(
    private writebackSvc: WritebackService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    setTimeout(() => this.firstFocus?.nativeElement?.focus(), 50);
    this.writebackSvc.getCellDetail(this.coordinates).subscribe({
      next: (resp) => {
        this.detail = resp;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = 'Failed to load cell detail.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  close(): void { this.closed.emit(); }
}
