import { Component, OnInit } from '@angular/core';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ApiService } from '../../../core/services/api.service';

export interface NavItem {
  id: number;
  menuKey: string;
  label: string;
  route: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  parentId: number | null;
  moduleCode: string | null;
  children?: NavItem[];
}

export interface AppModule {
  id: number;
  code: string;
  name: string;
  moduleType: string;
  icon: string | null;
  color: string | null;
  isActive: boolean;
}

@Component({
  selector: 'app-nav-manager-page',
  templateUrl: './nav-manager-page.component.html',
  styleUrls: ['./nav-manager-page.component.scss'],
})
export class NavManagerPageComponent implements OnInit {
  tree: NavItem[] = [];
  modules: AppModule[] = [];
  loading = true;
  saving = false;
  error: string | null = null;

  // Label edit modal
  editItem: NavItem | null = null;
  editLabel = '';
  editRoute = '';
  editIcon: string | null = null;
  editModuleCode: string | null = null;
  editSaving = false;

  // Add new item
  showAddForm = false;
  addParentId: number | null = null;
  addForm = this.emptyAdd();

  readonly iconOptions = [
    { value: 'home',     label: 'Home' },
    { value: 'document', label: 'Documento' },
    { value: 'chart',    label: 'Grafico' },
    { value: 'shield',   label: 'Sicurezza' },
    { value: 'users',    label: 'Utenti' },
    { value: 'settings', label: 'Impostazioni' },
    { value: 'bell',     label: 'Notifiche' },
    { value: 'grid',     label: 'Griglia' },
    { value: null,       label: '— nessuna —' },
  ];

  constructor(private api: ApiService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.api.get<NavItem[]>('/admin/navigation/tree').subscribe({
      next: data => { this.tree = data; this.loading = false; },
      error: ()  => { this.error = 'Impossibile caricare la navigazione'; this.loading = false; },
    });
    this.api.get<AppModule[]>('/admin/navigation/modules').subscribe({
      next: mods => { this.modules = mods; },
      error: ()  => {},
    });
  }

  /* -------- Toggle active -------- */
  toggleActive(item: NavItem) {
    item.isActive = !item.isActive;
    this.api.patch(`/admin/navigation/${item.id}`, { isActive: item.isActive }).subscribe({
      error: () => { item.isActive = !item.isActive; }, // revert on error
    });
  }

  /* -------- Drag-and-drop reorder (root level) -------- */
  onDrop(event: CdkDragDrop<NavItem[]>) {
    moveItemInArray(this.tree, event.previousIndex, event.currentIndex);
  }

  onDropChildren(event: CdkDragDrop<NavItem[]>, parent: NavItem) {
    moveItemInArray(parent.children!, event.previousIndex, event.currentIndex);
  }

  saveOrder() {
    this.saving = true;
    const items = this.flattenOrder(this.tree, null);
    this.api.patch('/admin/navigation/reorder', items).subscribe({
      next: () => { this.saving = false; },
      error: () => { this.saving = false; },
    });
  }

  private flattenOrder(
    items: NavItem[],
    parentId: number | null,
  ): Array<{ id: number; sortOrder: number; parentId: number | null }> {
    return items.flatMap((item, idx) => [
      { id: item.id, sortOrder: idx * 10, parentId },
      ...this.flattenOrder(item.children ?? [], item.id),
    ]);
  }

  /* -------- Edit modal -------- */
  openEdit(item: NavItem) {
    this.editItem = item;
    this.editLabel = item.label;
    this.editRoute = item.route ?? '';
    this.editIcon  = item.icon;
    this.editModuleCode = item.moduleCode;
  }

  closeEdit() { this.editItem = null; }

  saveEdit() {
    if (!this.editItem) return;
    this.editSaving = true;
    const patch = {
      label:      this.editLabel,
      route:      this.editRoute || null,
      icon:       this.editIcon,
      moduleCode: this.editModuleCode,
    };
    this.api.patch(`/admin/navigation/${this.editItem.id}`, patch).subscribe({
      next: () => {
        Object.assign(this.editItem!, patch);
        this.editItem = null;
        this.editSaving = false;
      },
      error: () => { this.editSaving = false; },
    });
  }

  /* -------- Add new item -------- */
  openAdd(parentId: number | null = null) {
    this.addParentId = parentId;
    this.addForm = this.emptyAdd();
    this.showAddForm = true;
  }

  cancelAdd() { this.showAddForm = false; }

  submitAdd() {
    if (!this.addForm.label || !this.addForm.menuKey) return;
    const payload = { ...this.addForm, parentId: this.addParentId, sortOrder: 999 };
    this.api.post<NavItem>('/admin/navigation', payload).subscribe({
      next: () => { this.showAddForm = false; this.load(); },
    });
  }

  /* -------- Delete -------- */
  delete(item: NavItem) {
    if (!confirm(`Eliminare la voce "${item.label}"?`)) return;
    this.api.delete(`/admin/navigation/${item.id}`).subscribe({ next: () => this.load() });
  }

  /* -------- Helpers -------- */
  moduleColor(code: string | null): string {
    if (!code) return '#8c8c8c';
    return this.modules.find(m => m.code === code)?.color ?? '#8c8c8c';
  }

  moduleName(code: string | null): string {
    if (!code) return '';
    return this.modules.find(m => m.code === code)?.name ?? code;
  }

  trackById(_: number, item: NavItem) { return item.id; }

  private emptyAdd() {
    return { menuKey: '', label: '', route: '', icon: 'document' as string | null, moduleCode: null as string | null, isActive: true };
  }
}
