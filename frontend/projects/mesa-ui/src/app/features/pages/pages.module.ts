import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { TranslateModule } from '@ngx-translate/core';
import { EsgConfiguratorModule } from '../esg-configurator/esg-configurator.module';
import { DataCollectionModule }  from '../data-collection/data-collection.module';

import { WelcomePageComponent }           from './welcome-page/welcome-page.component';
import { ModuliPageComponent }            from './moduli-page/moduli-page.component';
import { UsersPageComponent }             from './users-page/users-page.component';
import { NavManagerPageComponent }        from './nav-manager-page/nav-manager-page.component';
import { EsgConfiguratorPageComponent }   from './esg-configurator-page/esg-configurator-page.component';
import { EsgTaskPageComponent }           from './esg-task-page/esg-task-page.component';
import { EsgReportsPageComponent }        from './esg-reports-page/esg-reports-page.component';
import { HrDataCollectionPageComponent }  from './hr-data-collection-page/hr-data-collection-page.component';

@NgModule({
  declarations: [
    WelcomePageComponent,
    ModuliPageComponent,
    UsersPageComponent,
    NavManagerPageComponent,
    EsgConfiguratorPageComponent,
    EsgTaskPageComponent,
    EsgReportsPageComponent,
    HrDataCollectionPageComponent,
  ],
  imports: [CommonModule, FormsModule, DragDropModule, TranslateModule, EsgConfiguratorModule, DataCollectionModule],
  exports: [
    WelcomePageComponent,
    ModuliPageComponent,
    UsersPageComponent,
    NavManagerPageComponent,
    EsgConfiguratorPageComponent,
    EsgTaskPageComponent,
    EsgReportsPageComponent,
    HrDataCollectionPageComponent,
  ],
})
export class PagesModule {}
