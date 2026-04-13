import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';

interface MesaUser {
  id: number;
  username: string;
  displayName: string;
  initials: string;
  email: string;
  isActive: boolean;
  roles: string[];
}

@Component({
  selector: 'app-users-page',
  templateUrl: './users-page.component.html',
  styleUrls: ['./users-page.component.scss'],
})
export class UsersPageComponent implements OnInit {
  users: MesaUser[] = [];
  loading = true;
  error: string | null = null;

  showForm = false;
  editingId: number | null = null;
  saving = false;

  /** Drawer: user shown in read-only detail view before editing. */
  drawerUser: MesaUser | null = null;

  allRoles: { code: string; name: string }[] = [];

  form: Partial<MesaUser> & { password?: string } = this.emptyForm();

  // Sort & filter state
  filterText  = '';
  sortField: keyof MesaUser = 'displayName';
  sortDir:   1 | -1 = 1;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.load();
    this.api.get<{ code: string; name: string }[]>('/admin/roles').subscribe({
      next: roles => { this.allRoles = roles; },
      error: ()   => {
        this.allRoles = [
          { code: 'ADMIN',       name: 'Admin' },
          { code: 'COORDINATOR', name: 'Coordinatore' },
          { code: 'COMPILER',    name: 'Compilatore' },
        ];
      },
    });
  }

  get filteredUsers(): MesaUser[] {
    const q = this.filterText.trim().toLowerCase();
    let list = q
      ? this.users.filter(u =>
          u.displayName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q) ||
          u.roles.some(r => r.toLowerCase().includes(q)))
      : [...this.users];

    list.sort((a, b) => {
      const av = String(a[this.sortField] ?? '').toLowerCase();
      const bv = String(b[this.sortField] ?? '').toLowerCase();
      return av < bv ? -this.sortDir : av > bv ? this.sortDir : 0;
    });
    return list;
  }

  sort(field: keyof MesaUser): void {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 1 ? -1 : 1;
    } else {
      this.sortField = field;
      this.sortDir = 1;
    }
  }

  sortIcon(field: keyof MesaUser): string {
    if (this.sortField !== field) return '↕';
    return this.sortDir === 1 ? '↑' : '↓';
  }

  load() {
    this.loading = true;
    this.api.get<MesaUser[]>('/admin/users').subscribe({
      next: data => { this.users = data; this.loading = false; },
      error: ()  => { this.error = 'Impossibile caricare gli utenti'; this.loading = false; },
    });
  }

  openDetail(u: MesaUser): void {
    this.drawerUser = u;
  }

  closeDetail(): void {
    this.drawerUser = null;
  }

  openNew() {
    this.drawerUser = null;
    this.form = this.emptyForm();
    this.editingId = null;
    this.showForm = true;
  }

  openEdit(u: MesaUser) {
    this.drawerUser = null;
    this.form = { ...u, password: '' };
    this.editingId = u.id;
    this.showForm = true;
  }

  cancel() { this.showForm = false; }

  save() {
    if (!this.form.username || !this.form.displayName) return;
    this.saving = true;
    const payload = {
      username:    this.form.username,
      displayName: this.form.displayName,
      initials:    this.form.initials,
      email:       this.form.email,
      isActive:    this.form.isActive,
      roles:       this.form.roles ?? [],
      password:    this.form.password || undefined,
    };
    const req = this.editingId
      ? this.api.put(`/admin/users/${this.editingId}`, payload)
      : this.api.post('/admin/users', payload);

    req.subscribe({
      next: () => { this.showForm = false; this.saving = false; this.load(); },
      error: () => { this.saving = false; },
    });
  }

  delete(u: MesaUser) {
    if (!confirm(`Eliminare l'utente "${u.displayName}"?`)) return;
    this.api.delete(`/admin/users/${u.id}`).subscribe({ next: () => this.load() });
  }

  toggleRole(role: string) {
    const roles = this.form.roles ?? [];
    const idx = roles.indexOf(role);
    if (idx >= 0) roles.splice(idx, 1);
    else roles.push(role);
    this.form.roles = [...roles];
  }

  hasRole(role: string) { return (this.form.roles ?? []).includes(role); }

  roleLabel(code: string) {
    return this.allRoles.find(r => r.code === code)?.name ?? code;
  }

  private emptyForm() {
    return { username: '', displayName: '', initials: '', email: '', isActive: true, roles: [] as string[], password: '' };
  }
}
