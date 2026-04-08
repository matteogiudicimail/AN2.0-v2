import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuditEntry, Report } from '../../../../core/models/grid.model';
import { ApiService } from '../../../../core/services/api.service';

interface AuditPage { total: number; page: number; limit: number; items: AuditEntry[]; }

@Component({
  selector: 'app-audit-log-page',
  templateUrl: './audit-log-page.component.html',
  styleUrls: ['./audit-log-page.component.scss'],
})
export class AuditLogPageComponent implements OnChanges, OnDestroy {
  @Input() report!: Report;

  entries: AuditEntry[] = [];
  total = 0;
  page = 1;
  limit = 50;
  loading = false;

  private sub?: Subscription;

  constructor(private api: ApiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['report'] && this.report) this.load();
  }

  load(): void {
    this.loading = true;
    this.sub = this.api
      .get<AuditPage>(`/reports/${this.report.id}/audit?page=${this.page}&limit=${this.limit}`)
      .subscribe({
        next: res => { this.entries = res.items; this.total = res.total; this.loading = false; },
        error: () => { this.loading = false; },
      });
  }

  prevPage(): void { if (this.page > 1) { this.page--; this.load(); } }
  nextPage(): void { if (this.page * this.limit < this.total) { this.page++; this.load(); } }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }
}
