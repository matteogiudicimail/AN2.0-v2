/**
 * ConfiguratorModule — lazy-loadable admin section.
 * Route from the host shell: { path: 'configurator', loadChildren: () => import('cfs-report').then(m => m.ConfiguratorModule) }
 */
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { ConfiguratorRoutingModule } from './configurator-routing.module';
import { ConfiguratorService }       from './services/configurator.service';
import { TaskService }               from './services/task.service';

import { ConfiguratorShellComponent } from './components/configurator-shell/configurator-shell.component';
import { ReportListComponent }        from './components/report-list/report-list.component';
import { ReportWizardComponent }      from './components/report-wizard/report-wizard.component';
import { TaskListComponent }          from './components/task-list/task-list.component';

import { StepBasicComponent }      from './components/report-wizard/steps/step-basic/step-basic.component';
import { StepDbExplorerComponent } from './components/report-wizard/steps/step-db-explorer/step-db-explorer.component';
import { StepStructureComponent }  from './components/report-wizard/steps/step-structure/step-structure.component';
import { StepTasksComponent }      from './components/report-wizard/steps/step-tasks/step-tasks.component';

@NgModule({
  declarations: [
    ConfiguratorShellComponent,
    ReportListComponent,
    ReportWizardComponent,
    TaskListComponent,
    StepBasicComponent,
    StepDbExplorerComponent,
    StepStructureComponent,
    StepTasksComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    ConfiguratorRoutingModule,
  ],
  providers: [
    ConfiguratorService,
    TaskService,
  ],
})
export class ConfiguratorModule {}
