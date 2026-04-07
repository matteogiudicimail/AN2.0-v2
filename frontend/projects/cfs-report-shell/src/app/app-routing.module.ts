import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ReportPageComponent } from './report-page/report-page.component';

const routes: Routes = [
  {
    path: 'configurator',
    loadChildren: () =>
      import('cfs-report').then((m) => m.ConfiguratorModule),
  },
  {
    path: 'report/:reportId',
    component: ReportPageComponent,
  },
  {
    path: 'task/:taskId',
    component: ReportPageComponent,
  },
  {
    path: '**',
    component: ReportPageComponent,
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
