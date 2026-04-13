import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-esg-configurator-page',
  templateUrl: './esg-configurator-page.component.html',
  styleUrls: ['./esg-configurator-page.component.scss'],
})
export class EsgConfiguratorPageComponent implements OnChanges {
  @Input() openReportId: number | null = null;
  @Input() openStep: number = 5;

  @Output() openTask = new EventEmitter<{ taskId: number; label: string }>();

  view: 'list' | 'definition' | 'designer' = 'list';
  activeReportId: number | null = null;
  activeStep: number = 1;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['openReportId'] && this.openReportId != null) {
      this.activeReportId = this.openReportId;
      this.activeStep     = this.openStep;
      this.view           = this.openStep >= 4 ? 'designer' : 'definition';
    }
  }

  openDefinition(reportId: number | null): void {
    this.activeReportId = reportId;
    this.activeStep     = 1;
    this.view           = 'definition';
  }

  openDesigner(reportId: number): void {
    this.activeReportId = reportId;
    this.activeStep     = 4;
    this.view           = 'designer';
  }

  backToList(): void {
    this.activeReportId = null;
    this.activeStep     = 1;
    this.view           = 'list';
  }
}
