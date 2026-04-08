import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { ApiService } from '../../../core/services/api.service';
import { Comment } from '../../../core/models/grid.model';

@Component({
  selector: 'app-comment-modal',
  templateUrl: './comment-modal.component.html',
  styleUrls: ['./comment-modal.component.scss'],
})
export class CommentModalComponent implements OnChanges {
  @Input() reportId!: number;
  @Input() sectionId!: number;
  @Input() kpiId!: number;
  @Input() kpiName = '';
  @Input() dimensionValueId?: number;
  @Input() visible = false;

  @Output() closed = new EventEmitter<boolean>(); // true = comment added/deleted

  comments: Comment[] = [];
  newText = '';
  loading = false;
  saving = false;

  constructor(private api: ApiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.loadComments();
    }
  }

  loadComments(): void {
    if (!this.reportId || !this.sectionId || !this.kpiId) return;
    this.loading = true;
    let path = `/reports/${this.reportId}/sections/${this.sectionId}/comments?kpiId=${this.kpiId}`;
    if (this.dimensionValueId) path += `&dimensionValueId=${this.dimensionValueId}`;
    this.api.get<Comment[]>(path).subscribe({
      next: (data) => { this.comments = data; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  submit(): void {
    if (!this.newText.trim()) return;
    this.saving = true;
    const body: any = { kpiId: this.kpiId, text: this.newText.trim() };
    if (this.dimensionValueId) body.dimensionValueId = this.dimensionValueId;
    this.api.post<Comment>(
      `/reports/${this.reportId}/sections/${this.sectionId}/comments`,
      body,
    ).subscribe({
      next: (c) => {
        this.comments.push(c);
        this.newText = '';
        this.saving = false;
        this.closed.emit(true);
      },
      error: () => { this.saving = false; },
    });
  }

  delete(id: number): void {
    this.api.delete(`/reports/${this.reportId}/sections/${this.sectionId}/comments/${id}`)
      .subscribe({
        next: () => {
          this.comments = this.comments.filter((c) => c.id !== id);
          this.closed.emit(true);
        },
      });
  }

  close(): void {
    this.visible = false;
    this.closed.emit(false);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  }
}
