import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';

interface AppModule {
  id: number;
  code: string;
  name: string;
  description: string | null;
  moduleType: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  version: string;
  isActive: boolean;
}

@Component({
  selector: 'app-moduli-page',
  templateUrl: './moduli-page.component.html',
  styleUrls: ['./moduli-page.component.scss'],
})
export class ModuliPageComponent implements OnInit {
  moduli: AppModule[] = [];
  loading = true;
  error: string | null = null;

  showForm = false;
  editingId: number | null = null;
  saving = false;

  /** Drawer: module shown in read-only detail view before editing. */
  drawerModule: AppModule | null = null;

  form: Partial<AppModule> = this.emptyForm();

  // Sort & filter state
  filterText = '';
  sortField: keyof AppModule = 'sortOrder';
  sortDir: 1 | -1 = 1;

  constructor(private api: ApiService) {}

  ngOnInit(): void { this.load(); }

  get filteredModuli(): AppModule[] {
    const q = this.filterText.trim().toLowerCase();
    let list = q
      ? this.moduli.filter(m =>
          m.name.toLowerCase().includes(q) ||
          m.code.toLowerCase().includes(q) ||
          (m.description ?? '').toLowerCase().includes(q) ||
          m.moduleType.toLowerCase().includes(q))
      : [...this.moduli];

    list.sort((a, b) => {
      const av = String(a[this.sortField] ?? '').toLowerCase();
      const bv = String(b[this.sortField] ?? '').toLowerCase();
      return av < bv ? -this.sortDir : av > bv ? this.sortDir : 0;
    });
    return list;
  }

  sort(field: keyof AppModule): void {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 1 ? -1 : 1;
    } else {
      this.sortField = field;
      this.sortDir = 1;
    }
  }

  sortIcon(field: keyof AppModule): string {
    if (this.sortField !== field) return '↕';
    return this.sortDir === 1 ? '↑' : '↓';
  }

  load(): void {
    this.loading = true;
    this.api.get<AppModule[]>('/admin/modules').subscribe({
      next: data => { this.moduli = data; this.loading = false; },
      error: ()  => { this.error = 'Impossibile caricare i moduli'; this.loading = false; },
    });
  }

  openDetail(m: AppModule): void {
    this.drawerModule = m;
  }

  closeDetail(): void {
    this.drawerModule = null;
  }

  openNew(): void {
    this.drawerModule = null;
    this.form = this.emptyForm();
    this.editingId = null;
    this.showForm = true;
  }

  openEdit(m: AppModule): void {
    this.drawerModule = null;
    this.form = { ...m };
    this.editingId = m.id;
    this.showForm = true;
  }

  cancel(): void { this.showForm = false; }

  save(): void {
    if (!this.form.code || !this.form.name) return;
    this.saving = true;
    const payload = {
      code:        this.form.code,
      name:        this.form.name,
      description: this.form.description || null,
      moduleType:  this.form.moduleType || 'capability',
      icon:        this.form.icon || null,
      color:       this.form.color || null,
      sortOrder:   this.form.sortOrder ?? 0,
      version:     this.form.version || '1.0.0',
      isActive:    this.form.isActive ?? true,
    };
    const req = this.editingId
      ? this.api.put(`/admin/modules/${this.editingId}`, payload)
      : this.api.post('/admin/modules', payload);

    req.subscribe({
      next: () => { this.showForm = false; this.saving = false; this.load(); },
      error: () => { this.saving = false; },
    });
  }

  delete(m: AppModule): void {
    if (!confirm(`Eliminare il modulo "${m.name}"?`)) return;
    this.api.delete(`/admin/modules/${m.id}`).subscribe({ next: () => this.load() });
  }

  toggleActive(m: AppModule): void {
    this.api.put(`/admin/modules/${m.id}`, { ...m, isActive: !m.isActive }).subscribe({
      next: () => this.load(),
    });
  }

  private emptyForm(): Partial<AppModule> {
    return { code: '', name: '', description: '', moduleType: 'capability', icon: '', color: '#95C11F', sortOrder: 0, version: '1.0.0', isActive: true };
  }
}
