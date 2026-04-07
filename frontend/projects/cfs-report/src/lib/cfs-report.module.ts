/**
 * CfsReportModule — Angular feature module for the CFS Reporting & Writeback plugin.
 * Import with CfsReportModule.forRoot(config) from the MESAPPA host shell.
 */
import { NgModule, ModuleWithProviders } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { AgGridModule } from 'ag-grid-angular';

import { FilterPanelComponent }     from './components/filter-panel/filter-panel.component';
import { ReportGridComponent }       from './components/report-grid/report-grid.component';
import { ReportContainerComponent }  from './components/report-container/report-container.component';
import { AnnotationDialogComponent } from './components/annotation-dialog/annotation-dialog.component';
import { ConflictDialogComponent }   from './components/conflict-dialog/conflict-dialog.component';
import { CellHistoryDialogComponent } from './components/cell-history-dialog/cell-history-dialog.component';

import { ApiService }        from './services/api.service';
import { DimensionService }  from './services/dimension.service';
import { ReportService }     from './services/report.service';
import { WritebackService }  from './services/writeback.service';
import { CFS_CONFIG, Configuration } from './cfs-config.token';
export { Configuration } from './cfs-config.token';

/** Runtime data injected per-use by the MESAPPA host */
export interface InputData {
  token: string;
  apiBaseUrl?: string;
  role?: string;        // Viewer | Editor | Approver | Admin
  userId?: string;
  /** Se presente, carica automaticamente la definizione del report e pre-applica i filtri */
  reportId?: number;
  /** Se presente, carica il task (contesto + report) e pre-applica filtri e modalità */
  taskId?: number;
}

@NgModule({
  declarations: [
    FilterPanelComponent,
    ReportGridComponent,
    ReportContainerComponent,
    AnnotationDialogComponent,
    ConflictDialogComponent,
    CellHistoryDialogComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    HttpClientModule,
    AgGridModule,
  ],
  exports: [
    ReportContainerComponent,
  ],
})
export class CfsReportModule {
  static forRoot(config: Configuration): ModuleWithProviders<CfsReportModule> {
    return {
      ngModule: CfsReportModule,
      providers: [
        { provide: CFS_CONFIG, useValue: config },
        ApiService,
        DimensionService,
        ReportService,
        WritebackService,
      ],
    };
  }
}
