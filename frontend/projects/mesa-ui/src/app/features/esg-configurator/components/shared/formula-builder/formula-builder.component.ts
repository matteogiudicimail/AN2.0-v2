/**
 * FormulaBuilderComponent — visual formula editor for Aggregato PARAM rows.
 *
 * Allows building formulas like [Ricavi] - [Costi] by clicking reference chips
 * and operator buttons.  Emits the formula string on save.
 *
 * WCAG: all interactive buttons carry aria-label; formula textarea is labelled;
 * error messages use role="alert".
 */

import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { validateFormula } from '../../../services/formula-engine';

@Component({
  selector: 'esg-formula-builder',
  templateUrl: './formula-builder.component.html',
})
export class FormulaBuilderComponent implements OnChanges {
  /** SourceValues available as formula references */
  @Input() availableRefs: string[] = [];
  /** Existing formula to pre-load (null = new formula) */
  @Input() currentFormula: string | null = null;
  /** Row label — used for display only */
  @Input() rowLabel = '';

  @Output() formulaSaved  = new EventEmitter<string>();
  @Output() cancelled     = new EventEmitter<void>();

  formula = '';
  validationError: string | null = null;
  isValid = false;
  refSearch = '';

  readonly OPERATORS = ['+', '-', '*', '/'];

  get filteredRefs(): string[] {
    const q = this.refSearch.trim().toLowerCase();
    if (!q) return this.availableRefs;
    return this.availableRefs.filter((r) => r.toLowerCase().includes(q));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentFormula']) {
      this.formula        = this.currentFormula ?? '';
      this.validationError = null;
      this.isValid         = false;
      if (this.formula) this.validate();
    }
  }

  // ── Builder actions ─────────────────────────────────────────────────────────

  insertRef(ref: string): void {
    this.formula += `[${ref}]`;
    this.validate();
  }

  insertOperator(op: string): void {
    this.formula += ` ${op} `;
    this.validate();
  }

  insertParen(p: '(' | ')'): void {
    this.formula += p;
    this.validate();
  }

  clearFormula(): void {
    this.formula         = '';
    this.validationError = null;
    this.isValid         = false;
  }

  backspace(): void {
    this.formula = this.formula.trimEnd();
    // Remove last token: [ref], operator, or single char
    const refMatch = this.formula.match(/^(.*)\[[^\]]+\]$/s);
    if (refMatch) { this.formula = refMatch[1].trimEnd(); }
    else if (this.formula.length > 0) { this.formula = this.formula.slice(0, -1).trimEnd(); }
    this.validate();
  }

  onFormulaInput(): void {
    this.validate();
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  private validate(): void {
    if (!this.formula.trim()) {
      this.validationError = null;
      this.isValid         = false;
      return;
    }
    const result = validateFormula(this.formula, this.availableRefs);
    this.isValid         = result.valid;
    this.validationError = result.valid ? null : (result.error ?? 'Invalid formula');
  }

  // ── Save / Cancel ────────────────────────────────────────────────────────────

  save(): void {
    this.validate();
    if (!this.isValid) return;
    this.formulaSaved.emit(this.formula.trim());
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
