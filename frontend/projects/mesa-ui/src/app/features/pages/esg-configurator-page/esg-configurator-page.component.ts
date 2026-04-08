import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-esg-configurator-page',
  templateUrl: './esg-configurator-page.component.html',
  styleUrls: ['./esg-configurator-page.component.scss'],
})
export class EsgConfiguratorPageComponent implements OnChanges {
  /** When set by the parent (e.g. clicking a published report in the sidebar),
   *  automatically opens the wizard at the given step for this report. */
  @Input() openReportId: number | null = null;
  @Input() openStep: number = 5;

  view: 'list' | 'wizard' = 'list';
  activeReportId: number | null = null;
  activeStep: number = 1;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['openReportId'] && this.openReportId != null) {
      this.activeReportId = this.openReportId;
      this.activeStep     = this.openStep;
      this.view           = 'wizard';
    }
  }

  openWizard(reportId: number | null): void {
    this.activeReportId = reportId;
    this.activeStep     = 1;
    this.view           = 'wizard';
  }

  backToList(): void {
    this.activeReportId = null;
    this.activeStep     = 1;
    this.view           = 'list';
  }
}
