import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../../shared/shared.module';
import { AuditLogPageComponent } from './pages/audit-log-page/audit-log-page.component';

@NgModule({
  declarations: [AuditLogPageComponent],
  imports: [CommonModule, SharedModule],
  exports: [AuditLogPageComponent],
})
export class AuditModule {}
