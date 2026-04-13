import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoginComponent } from './pages/login/login.component';

@NgModule({
  declarations: [LoginComponent],
  imports: [CommonModule, FormsModule],
  exports: [LoginComponent],
})
export class AuthFeatureModule {}
