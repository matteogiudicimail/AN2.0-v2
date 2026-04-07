/**
 * Public API for the CFS Report plugin.
 * Only expose: module, root component, and InputData/Configuration types.
 * No mocks or internal implementation details. (CLAUDE.md rule)
 */
export { CfsReportModule, Configuration, InputData } from './lib/cfs-report.module';
export { ReportContainerComponent }                   from './lib/components/report-container/report-container.component';
export { ConfiguratorModule }                         from './lib/configurator/configurator.module';
// Esposto solo per APP_INITIALIZER della dev-shell — non usare nei componenti
export { ApiService }                                 from './lib/services/api.service';
