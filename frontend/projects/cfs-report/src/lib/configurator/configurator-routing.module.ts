import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ConfiguratorShellComponent } from './components/configurator-shell/configurator-shell.component';
import { ReportListComponent }        from './components/report-list/report-list.component';
import { ReportWizardComponent }      from './components/report-wizard/report-wizard.component';
import { TaskListComponent }          from './components/task-list/task-list.component';

const routes: Routes = [
  {
    path: '',
    component: ConfiguratorShellComponent,
    children: [
      { path: '',        redirectTo: 'reports', pathMatch: 'full' },
      { path: 'reports', component: ReportListComponent },
      { path: 'wizard/:id', component: ReportWizardComponent },
      { path: 'tasks',   component: TaskListComponent },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ConfiguratorRoutingModule {}
