/**
 * Annotation Dialog — shown before saving an aggregate-level writeback.
 * Annotation is mandatory for aggregate cells (F10).
 *
 * WCAG 2.1 AA:
 *   2.1.1  — Focus trapped inside dialog while open
 *   4.1.2  — role="dialog", aria-modal, aria-labelledby
 */
import {
  Component, Input, Output, EventEmitter, OnInit, ElementRef, ViewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

export interface AnnotationResult {
  confirmed: boolean;
  annotation: string;
  newValue: number;
}

@Component({
  selector: 'cfs-annotation-dialog',
  templateUrl: './annotation-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnnotationDialogComponent implements OnInit {
  @Input() currentValue = 0;
  @Input() rowLabel = '';
  @Input() processLabel = '';
  @Input() requireAnnotation = true;
  /** When true, the value field label reads "Adjustment amount" instead of "New value" */
  @Input() isAggregate = false;

  @Output() closed = new EventEmitter<AnnotationResult>();

  @ViewChild('firstFocus', { static: true }) firstFocus!: ElementRef<HTMLElement>;

  form!: FormGroup;

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      newValue: [this.currentValue, Validators.required],
      annotation: ['', this.requireAnnotation ? [Validators.required, Validators.minLength(3)] : []],
    });

    // Trap focus: defer until after render
    setTimeout(() => this.firstFocus?.nativeElement?.focus(), 50);
  }

  onConfirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.closed.emit({
      confirmed: true,
      annotation: this.form.value['annotation'] ?? '',
      newValue: Number(this.form.value['newValue']),
    });
  }

  onCancel(): void {
    this.closed.emit({ confirmed: false, annotation: '', newValue: 0 });
  }
}
