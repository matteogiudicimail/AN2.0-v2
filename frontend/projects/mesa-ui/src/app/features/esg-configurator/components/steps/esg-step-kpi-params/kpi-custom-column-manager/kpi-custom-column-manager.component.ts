import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { EsgConfiguratorService } from '../../../../services/esg-configurator.service';
import { CustomColumnDef, ParamTableInfo } from '../../../../models/esg-configurator.models';

@Component({
  selector: 'kpi-custom-column-manager',
  templateUrl: './kpi-custom-column-manager.component.html',
})
export class KpiCustomColumnManagerComponent implements OnInit {
  @Input() paramTableId!: number;
  @Input() columnDefs: CustomColumnDef[] = [];
  @Output() saved     = new EventEmitter<ParamTableInfo>();
  @Output() cancelled = new EventEmitter<void>();

  defs: CustomColumnDef[] = [];
  showAddForm = false;
  isSaving    = false;
  errorMsg: string | null = null;

  addForm: FormGroup;

  constructor(private svc: EsgConfiguratorService, private fb: FormBuilder) {
    this.addForm = this.fb.group({
      name:     ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9_]+$/)]],
      label:    ['', Validators.required],
      dataType: ['text', Validators.required],
      width:    [null],
    });
  }

  ngOnInit(): void {
    this.defs = this.columnDefs.map((d) => ({ ...d }));
  }

  addColumn(): void {
    if (this.addForm.invalid) { this.addForm.markAllAsTouched(); return; }
    const v = this.addForm.value;
    const already = this.defs.some((d) => d.name === v.name);
    if (already) { this.errorMsg = `Column "${v.name}" already exists.`; return; }
    this.defs.push({
      name:     v.name,
      label:    v.label,
      dataType: v.dataType,
      width:    v.width ? Number(v.width) : undefined,
    });
    this.addForm.reset({ dataType: 'text', width: null });
    this.showAddForm = false;
    this.errorMsg    = null;
  }

  removeColumn(idx: number): void {
    this.defs.splice(idx, 1);
  }

  save(): void {
    this.isSaving = true;
    this.errorMsg = null;
    this.svc.updateCustomColumns(this.paramTableId, this.defs).subscribe({
      next:  (info) => { this.isSaving = false; this.saved.emit(info); },
      error: ()     => { this.errorMsg = 'Impossibile salvare le colonne personalizzate.'; this.isSaving = false; },
    });
  }

  trackByName(_: number, d: CustomColumnDef): string { return d.name; }
}
