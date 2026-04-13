import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { DragDropModule } from '@angular/cdk/drag-drop';

import { EsgConfiguratorService }           from './services/esg-configurator.service';
import { EsgReportListComponent }            from './components/esg-report-list/esg-report-list.component';
import { EsgReportWizardComponent }          from './components/esg-report-wizard/esg-report-wizard.component';
import { EsgStepBasicComponent }             from './components/steps/esg-step-basic/esg-step-basic.component';
import { EsgStepDbExplorerComponent }        from './components/steps/esg-step-db-explorer/esg-step-db-explorer.component';
import { EsgStepKpiParamsComponent }         from './components/steps/esg-step-kpi-params/esg-step-kpi-params.component';
import { KpiParamGridComponent }             from './components/steps/esg-step-kpi-params/kpi-param-grid/kpi-param-grid.component';
import { KpiMetadataLensComponent }          from './components/steps/esg-step-kpi-params/kpi-metadata-lens/kpi-metadata-lens.component';
import { KpiCustomColumnManagerComponent }   from './components/steps/esg-step-kpi-params/kpi-custom-column-manager/kpi-custom-column-manager.component';
import { EsgStepEntryLayoutComponent }       from './components/steps/esg-step-entry-layout/esg-step-entry-layout.component';
import { EsgStepLayoutPreviewComponent }    from './components/steps/esg-step-layout-preview/esg-step-layout-preview.component';
import { EsgDataEntrySheetComponent }        from './components/steps/esg-data-entry-sheet/esg-data-entry-sheet.component';
import { InsertRowDialogComponent }          from './components/steps/esg-data-entry-sheet/insert-row-dialog/insert-row-dialog.component';
import { SnapshotViewerComponent }           from './components/steps/esg-step-publish/snapshot-viewer/snapshot-viewer.component';
import { EsgStepPublishComponent }           from './components/steps/esg-step-publish/esg-step-publish.component';
import { PublishDialogComponent }            from './components/steps/esg-step-publish/publish-dialog/publish-dialog.component';
import { CfgSearchableSelectComponent }      from './components/shared/cfg-searchable-select/cfg-searchable-select.component';
import { FormulaBuilderComponent }           from './components/shared/formula-builder/formula-builder.component';
import { MasterDataManagerComponent }        from './components/shared/master-data-manager/master-data-manager.component';
import { LockMembersDialogComponent }        from './components/shared/lock-members-dialog/lock-members-dialog.component';
import { DimTableCrudComponent }             from './components/shared/dim-table-crud/dim-table-crud.component';

@NgModule({
  declarations: [
    EsgReportListComponent,
    EsgReportWizardComponent,
    EsgStepBasicComponent,
    EsgStepDbExplorerComponent,
    EsgStepKpiParamsComponent,
    KpiParamGridComponent,
    KpiMetadataLensComponent,
    KpiCustomColumnManagerComponent,
    EsgStepEntryLayoutComponent,
    EsgStepLayoutPreviewComponent,
    EsgDataEntrySheetComponent,
    InsertRowDialogComponent,
    EsgStepPublishComponent,
    PublishDialogComponent,
    SnapshotViewerComponent,
    CfgSearchableSelectComponent,
    FormulaBuilderComponent,
    MasterDataManagerComponent,
    LockMembersDialogComponent,
    DimTableCrudComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    DragDropModule,
  ],
  exports: [
    EsgReportListComponent,
    EsgReportWizardComponent,
    // Exported so EsgTaskPageComponent (in PagesModule) can render the snapshot grid.
    SnapshotViewerComponent,
  ],
  providers: [
    EsgConfiguratorService,
  ],
})
export class EsgConfiguratorModule {}
