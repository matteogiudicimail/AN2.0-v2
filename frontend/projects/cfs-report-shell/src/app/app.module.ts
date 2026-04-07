import { APP_INITIALIZER, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { ReportPageComponent } from './report-page/report-page.component';
import { CfsReportModule, ApiService } from 'cfs-report';

function initDevToken(api: ApiService): () => Promise<void> {
  return () =>
    fetch('/api/auth/dev-token')
      .then((r) => r.json())
      .then((d: { token: string }) => api.setToken(d.token))
      .catch(() => { /* in produzione il token arriva da MESAPPA */ });
}

@NgModule({
  declarations: [
    AppComponent,
    ReportPageComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    CfsReportModule.forRoot({
      apiBaseUrl: 'http://localhost:3000/api',
    }),
  ],
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: initDevToken,
      deps: [ApiService],
      multi: true,
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
