/**
 * HrDataCollectionPageComponent — shell page for MESA HR Data Collection.
 *
 * Loads the list of MESA reports, lets the user select one, shows its
 * sections in the sidebar-like list, and renders GridPageComponent for
 * the selected section.
 */
import { Component, Input, OnInit } from '@angular/core';
import { GridDataService } from '../../data-collection/services/grid-data.service';
import { Report, Section, User } from '../../../core/models/grid.model';

@Component({
  selector: 'app-hr-data-collection-page',
  templateUrl: './hr-data-collection-page.component.html',
  styleUrls: ['./hr-data-collection-page.component.scss'],
})
export class HrDataCollectionPageComponent implements OnInit {
  @Input() user: User | null = null;

  reports: Report[] = [];
  selectedReport: Report | null = null;
  sections: Section[] = [];
  selectedSection: Section | null = null;

  loading  = false;
  errorMsg: string | null = null;

  constructor(private gridDataService: GridDataService) {}

  ngOnInit(): void {
    this.loadReports();
  }

  loadReports(): void {
    this.loading  = true;
    this.errorMsg = null;
    this.gridDataService.loadReports().subscribe({
      next: (reports) => {
        this.reports = reports;
        this.loading = false;
        // Auto-select first report if only one exists
        if (reports.length === 1) {
          this.selectReport(reports[0]!);
        }
      },
      error: () => {
        this.errorMsg = 'Impossibile caricare i report.';
        this.loading  = false;
      },
    });
  }

  selectReport(report: Report): void {
    this.selectedReport  = report;
    this.selectedSection = null;
    this.sections        = [];
    this.gridDataService.loadSections(report.id).subscribe({
      next: (sections) => {
        this.sections = sections;
        // Auto-select first section
        if (sections.length > 0) {
          this.selectedSection = sections[0]!;
        }
      },
      error: () => { this.errorMsg = 'Impossibile caricare le sezioni.'; },
    });
  }

  selectReportById(id: number | string): void {
    const report = this.reports.find(r => r.id === +id);
    if (report) this.selectReport(report);
  }

  selectSection(section: Section): void {
    this.selectedSection = section;
  }

  sectionStatusClass(status: string): string {
    if (status === 'COMPLETE')   return 'hr-dc__sec--complete';
    if (status === 'INCOMPLETE') return 'hr-dc__sec--incomplete';
    return 'hr-dc__sec--empty';
  }

  sectionStatusIcon(status: string): string {
    if (status === 'COMPLETE')   return '✅';
    if (status === 'INCOMPLETE') return '⚠️';
    return '○';
  }
}
