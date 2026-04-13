import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// MVP: section navigation is sidebar-driven (ngIf switching), not route-based.
// Routes reserved for Sprint 2+ deep-linking support.
const routes: Routes = [];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
