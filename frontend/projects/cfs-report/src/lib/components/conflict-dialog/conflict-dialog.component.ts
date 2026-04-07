/**
 * Conflict Dialog — shown when the server returns a 409 conflict (F11).
 * Lets the user choose: accept server value or retry.
 *
 * WCAG 4.1.2  — role=dialog, aria-modal, aria-labelledby
 */
import {
  Component, Input, Output, EventEmitter, OnInit, ElementRef, ViewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ConflictInfo } from '../../models/writeback.models';

export type ConflictResolution = 'discard' | 'retry';

@Component({
  selector: 'cfs-conflict-dialog',
  templateUrl: './conflict-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConflictDialogComponent implements OnInit {
  @Input() conflict!: ConflictInfo;
  @Output() resolved = new EventEmitter<ConflictResolution>();

  @ViewChild('firstFocus', { static: true }) firstFocus!: ElementRef<HTMLElement>;

  ngOnInit(): void {
    setTimeout(() => this.firstFocus?.nativeElement?.focus(), 50);
  }

  discard(): void  { this.resolved.emit('discard'); }
  retry(): void    { this.resolved.emit('retry'); }
}
