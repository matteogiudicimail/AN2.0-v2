import { InjectionToken } from '@angular/core';

/** Static plugin configuration — passed via CfsReportModule.forRoot() */
export interface Configuration {
  apiBaseUrl: string;
}

export const CFS_CONFIG = new InjectionToken<Configuration>('CFS_CONFIG');
