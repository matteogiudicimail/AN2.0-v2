/**
 * Filter panel — provides Entity, Scope, Currency, Process selectors.
 * Emits a FilterState when the user clicks Apply.
 *
 * WCAG 2.1 AA:
 *   1.3.1  — Form labels associated via for/id
 *   2.1.1  — All controls keyboard accessible (native HTML)
 *   1.4.3  — Text contrast ensured via SCSS
 *   4.1.2  — aria-required, aria-label on multi-selects
 */
import {
  Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges,
  Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { DimensionService } from '../../services/dimension.service';
import {
  Entity, Process, Scope, AdjLevel, Currency, CostCenter, CO, Counterpart,
} from '../../models/dimension.models';
import { FilterState, DEFAULT_FILTER_STATE } from '../../models/filter-state.model';
import { ReportPresetFilters, ReportFilterConfig, ColumnDimension } from '../../models/report-definition.model';

@Component({
  selector: 'cfs-filter-panel',
  templateUrl: './filter-panel.component.html',
  styleUrls: ['./filter-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterPanelComponent implements OnInit, OnChanges, OnDestroy {
  /** Valori preimpostati dalla definizione del report (cfg_ReportFilter.DefaultValue). */
  @Input() initialValues?: ReportPresetFilters;
  /**
   * Configurazione visibilità/obbligatorietà dei campi filtro, dal Configurator.
   * null = nessuna configurazione → tutti i campi visibili (modalità classica).
   */
  @Input() filterConfig?: ReportFilterConfig | null;
  /**
   * Quale dimensione usare come colonne della griglia.
   * Cambia le label dei campi entity e adjLevel per indicare il ruolo "colonne".
   */
  @Input() columnDimension: ColumnDimension = 'Process';
  @Output() filterApplied = new EventEmitter<FilterState>();

  form!: FormGroup;

  entities: Entity[] = [];
  processes: Process[] = [];
  scopes: Scope[] = [];
  adjLevels: AdjLevel[] = [];
  currencies: Currency[] = [];
  costCenters: CostCenter[] = [];
  cos: CO[] = [];
  counterparts: Counterpart[] = [];

  isLoadingScopes = false;
  isLoadingAdjLevels = false;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private dimSvc: DimensionService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      entityIds:             [[], [Validators.required, Validators.minLength(1)]],
      scopeId:               [null, Validators.required],
      currencyId:            [null, Validators.required],
      loadIds:               [[], [Validators.required, Validators.minLength(1)]],
      includeManualWriteback:[DEFAULT_FILTER_STATE.includeManualWriteback],
      adjLevelIds:           [[]],
      costCenterCodes:       [[]],
      coCodes:               [[]],
      counterpartIds:        [[]],
    });

    // Se filterConfig è già disponibile all'init, aggiorna subito i validator
    if (this.filterConfig !== undefined) {
      this.updateValidators();
    }

    this.loadDimensions();

    // Reload adj levels when scope changes
    this.form.get('scopeId')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((id: number) => { if (id) this.loadAdjLevels(id); });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.form) return;

    // Prima aggiorna i validator (filterConfig), poi applica il preset (initialValues)
    if (changes['filterConfig']) {
      this.updateValidators();
    }
    if (changes['initialValues'] && this.initialValues) {
      this.applyPreset(this.initialValues);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Helpers pubblici per il template ────────────────────────────────────────

  /**
   * Restituisce true se il campo deve essere mostrato.
   * In modalità classica (filterConfig null/undefined) tutti i campi sono visibili.
   */
  isVisible(key: keyof ReportFilterConfig): boolean {
    if (this.filterConfig == null) return true;
    return this.filterConfig[key]?.visible === true;
  }

  /**
   * Restituisce true se il campo è obbligatorio.
   * In modalità classica i 4 campi principali sono sempre obbligatori.
   */
  isMandatory(key: keyof ReportFilterConfig): boolean {
    if (this.filterConfig == null) {
      // Modalità classica: obbligatori i 4 campi principali
      return key === 'entity' || key === 'scope' || key === 'currency' || key === 'process';
    }
    return this.filterConfig[key]?.mandatory === true;
  }

  /** Label del campo Entity — "Entities (columns)" quando è la dimensione colonne */
  get entityLabel(): string {
    return this.columnDimension === 'Entity' ? 'Entities (columns)' : 'Entity';
  }

  /** Label del campo AdjLevel — "Adj Levels (columns)" quando è la dimensione colonne */
  get adjLevelLabel(): string {
    return this.columnDimension === 'AdjLevel' ? 'Adj Levels (columns)' : 'Adj Level';
  }

  /** True se almeno un campo nei filtri avanzati è visibile */
  get hasVisibleAdvancedFilters(): boolean {
    return (
      this.isVisible('adjLevel') ||
      this.isVisible('costCenter') ||
      this.isVisible('co') ||
      this.isVisible('counterpart') ||
      this.isVisible('includeManualWriteback')
    );
  }

  // ── Validator update ─────────────────────────────────────────────────────────

  private updateValidators(): void {
    type CtrlSpec = { control: string; cfgKey: keyof ReportFilterConfig; isArray: boolean };
    const specs: CtrlSpec[] = [
      { control: 'entityIds',  cfgKey: 'entity',   isArray: true  },
      { control: 'scopeId',    cfgKey: 'scope',     isArray: false },
      { control: 'currencyId', cfgKey: 'currency',  isArray: false },
      { control: 'loadIds',    cfgKey: 'process',   isArray: true  },
    ];

    for (const { control, cfgKey, isArray } of specs) {
      const ctrl = this.form.get(control);
      if (!ctrl) continue;

      if (this.isMandatory(cfgKey)) {
        ctrl.setValidators(isArray
          ? [Validators.required, Validators.minLength(1)]
          : [Validators.required]);
      } else {
        ctrl.clearValidators();
      }
      ctrl.updateValueAndValidity({ emitEvent: false });
    }

    this.cdr.markForCheck();
  }

  // ── Preset ───────────────────────────────────────────────────────────────────

  /** Precompila il form coi valori del report e, se tutti i campi obbligatori sono ok, applica. */
  private applyPreset(preset: ReportPresetFilters): void {
    const patch: Record<string, unknown> = {};
    if (preset.entityIds?.length)   patch['entityIds']  = preset.entityIds;
    if (preset.scopeId != null)     patch['scopeId']    = preset.scopeId;
    if (preset.currencyId != null)  patch['currencyId'] = preset.currencyId;
    if (preset.loadIds?.length)     patch['loadIds']    = preset.loadIds;

    this.form.patchValue(patch);
    this.cdr.markForCheck();

    // Auto-apply se il form è valido (tutti i campi obbligatori hanno un valore)
    if (this.form.valid) {
      setTimeout(() => { this.onApply(); }, 0);
    }
  }

  // ── Dimension loading ────────────────────────────────────────────────────────

  private loadDimensions(): void {
    this.dimSvc.getEntities().pipe(takeUntil(this.destroy$)).subscribe({
      next: (d) => { this.entities = d; this.cdr.markForCheck(); },
      error: (e) => console.error('[FilterPanel] entities:', e.status, e.message),
    });
    this.dimSvc.getProcesses().pipe(takeUntil(this.destroy$)).subscribe({
      next: (d) => { this.processes = d; this.cdr.markForCheck(); },
      error: (e) => console.error('[FilterPanel] processes:', e.status, e.message),
    });
    this.dimSvc.getScopes().pipe(takeUntil(this.destroy$)).subscribe({
      next: (d) => {
        this.scopes = d;
        // Imposta il primo scope come default SOLO se il preset non ha già un valore
        if (d.length > 0 && this.form.get('scopeId')!.value == null) {
          this.form.patchValue({ scopeId: d[0].scopeId });
        }
        this.cdr.markForCheck();
      },
      error: (e) => console.error('[FilterPanel] scopes:', e.status, e.message),
    });
    this.dimSvc.getCurrencies().pipe(takeUntil(this.destroy$)).subscribe({
      next: (d) => {
        this.currencies = d;
        // Imposta la prima valuta come default SOLO se il preset non ha già un valore
        if (d.length > 0 && this.form.get('currencyId')!.value == null) {
          this.form.patchValue({ currencyId: d[0].currencyId });
        }
        this.cdr.markForCheck();
      },
      error: (e) => console.error('[FilterPanel] currencies:', e.status, e.message),
    });
    this.dimSvc.getCostCenters().pipe(takeUntil(this.destroy$)).subscribe({
      next: (d) => { this.costCenters = d; this.cdr.markForCheck(); },
    });
    this.dimSvc.getCOs().pipe(takeUntil(this.destroy$)).subscribe({
      next: (d) => { this.cos = d; this.cdr.markForCheck(); },
    });
    this.dimSvc.getCounterparts().pipe(takeUntil(this.destroy$)).subscribe({
      next: (d) => { this.counterparts = d; this.cdr.markForCheck(); },
    });
  }

  private loadAdjLevels(scopeId: number): void {
    this.isLoadingAdjLevels = true;
    this.dimSvc.getAdjLevels(scopeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (d) => {
        this.adjLevels = d;
        this.isLoadingAdjLevels = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.isLoadingAdjLevels = false;
        console.error('[FilterPanel] adjLevels:', e.status, e.message);
        this.cdr.markForCheck();
      },
    });
  }

  onApply(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    const state: FilterState = {
      entityIds:             (Array.isArray(v['entityIds']) ? v['entityIds'] : [v['entityIds']]).map(Number),
      scopeId:               Number(v['scopeId']),
      currencyId:            Number(v['currencyId']),
      loadIds:               (Array.isArray(v['loadIds']) ? v['loadIds'] : [v['loadIds']]).map(Number),
      includeManualWriteback: Boolean(v['includeManualWriteback']),
      adjLevelIds:           v['adjLevelIds'] ?? [],
      costCenterCodes:       v['costCenterCodes'] ?? [],
      coCodes:               v['coCodes'] ?? [],
      counterpartIds:        v['counterpartIds'] ?? [],
    };
    this.filterApplied.emit(state);
  }
}
