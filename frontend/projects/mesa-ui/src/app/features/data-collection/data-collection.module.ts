import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../../shared/shared.module';
import { DataGridComponent } from './components/data-grid/data-grid.component';
import { GridPageComponent } from './pages/grid-page/grid-page.component';

@NgModule({
  declarations: [
    DataGridComponent,
    GridPageComponent,
  ],
  imports: [CommonModule, SharedModule],
  exports: [GridPageComponent],
})
export class DataCollectionModule {}
