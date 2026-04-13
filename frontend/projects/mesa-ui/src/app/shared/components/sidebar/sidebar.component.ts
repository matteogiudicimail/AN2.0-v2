import { Component, EventEmitter, HostListener, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { User } from '../../../core/models/grid.model';
import { ThemeService } from '../../../core/services/theme.service';
import { ActiveView } from '../../../app.component';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { TranslateService } from '@ngx-translate/core';

interface SidebarNavItem {
  id: number;
  menuKey: string;
  label: string;
  route: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  parentId: number | null;
  moduleCode: string | null;
  children?: SidebarNavItem[];
}

interface EsgPublishedTask {
  taskId:          number;
  reportId:        number;
  label:           string;
  parentMenuCode?: string | null;
  defaultFilters?: string | null;
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent implements OnInit, OnChanges {
  @Input() activeView: ActiveView = 'welcome';
  @Input() user: User | null = null;

  @Output() welcomeSelected    = new EventEmitter<void>();
  @Output() moduliSelected     = new EventEmitter<void>();
  @Output() usersSelected      = new EventEmitter<void>();
  @Output() navManagerSelected = new EventEmitter<void>();
  @Output() cfsReportSelected    = new EventEmitter<number | null>();
  @Output() esgReportsSelected      = new EventEmitter<void>();
  @Output() esgConfiguratorSelected = new EventEmitter<void>();
  /** Emitted when the user clicks a published ESG task — carries taskId, label and defaultFilters. */
  @Output() esgTaskSelected         = new EventEmitter<{ taskId: number; label: string; defaultFilters?: string | null }>();
  /** @deprecated — kept for any legacy bindings; use esgTaskSelected for ESG tasks. */
  @Output() esgReportSelected       = new EventEmitter<number>();
  @Output() logoutSelected       = new EventEmitter<void>();
  @Output() collapsedChange    = new EventEmitter<boolean>();

  collapsed    = false;
  settingsOpen = false;
  searchQuery  = '';
  selectedLang = 'it';
  navItems: SidebarNavItem[] = [];
  navLoading = true;
  activeChildId: number | null = null;

  esgTasks: EsgPublishedTask[] = [];
  esgTasksLoading = false;
  activeEsgTaskId: number | null = null;

  readonly langs = [
    { code: 'it', label: 'Italiano' },
    { code: 'en', label: 'English' },
  ];

  constructor(
    public theme: ThemeService,
    private api: ApiService,
    private http: HttpClient,
    private authService: AuthService,
    private translate: TranslateService,
  ) {}

  private _prevView: ActiveView = 'welcome';

  ngOnInit(): void {
    this.loadNav();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['activeView']) {
      const prev = changes['activeView'].previousValue as ActiveView;
      const curr = changes['activeView'].currentValue  as ActiveView;
      // Reload nav when navigating away from nav-manager or moduli
      if ((prev === 'nav-manager' || prev === 'moduli') && curr !== prev) {
        this.loadNav();
      }
      // Reset selected child when leaving cfs-report view
      if (curr !== 'cfs-report') {
        this.activeChildId = null;
      }
    }
  }

  loadNav(): void {
    this.navLoading = true;
    this.api.get<SidebarNavItem[]>('/admin/navigation/tree').subscribe({
      next: items => {
        this.navItems = items.filter(i => i.isActive && !i.parentId && i.menuKey !== 'home');
        this.navLoading = false;
      },
      error: () => { this.navLoading = false; },
    });
  }

  loadEsgTasks(): void {
    this.esgTasksLoading = true;
    const token = this.authService.token;
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders({});
    this.http.get<EsgPublishedTask[]>('/cfs-api/tasks?status=Active&domain=ESG', { headers }).subscribe({
      next: tasks => { this.esgTasks = tasks; this.esgTasksLoading = false; },
      error: ()    => { this.esgTasksLoading = false; },
    });
  }

  /**
   * Tasks shown in the dedicated "ESG Reports" section.
   * A task is hidden here only if it already appears as a NavigationItem child
   * in the nav tree (identified by route /esg-task/:taskId).
   * Tasks with parentMenuCode but no corresponding nav item remain visible here
   * as a fallback (e.g. when registerMenuItem hasn't run yet).
   */
  get visibleEsgTasks(): EsgPublishedTask[] {
    const treeTaskIds = new Set<number>();
    for (const item of this.navItems) {
      for (const child of (item.children ?? [])) {
        const m = child.route?.match(/\/esg-task\/(\d+)/);
        if (m) treeTaskIds.add(parseInt(m[1], 10));
      }
      const m = item.route?.match(/\/esg-task\/(\d+)/);
      if (m) treeTaskIds.add(parseInt(m[1], 10));
    }
    return this.esgTasks.filter((t) => !treeTaskIds.has(t.taskId));
  }

  selectEsgTask(task: EsgPublishedTask): void {
    this.activeEsgTaskId = task.taskId;
    this.esgTaskSelected.emit({ taskId: task.taskId, label: task.label, defaultFilters: task.defaultFilters ?? null });
  }

  selectNavItem(item: SidebarNavItem): void {
    this.activeChildId = null;
    this._emitForItem(item, null);
  }

  selectChildNavItem(child: SidebarNavItem): void {
    this.activeChildId = child.id;
    const taskId = this._extractTaskId(child.route);
    this._emitForItem(child, taskId);
  }

  /** Extracts a numeric taskId from routes like /cfs/task/4 → 4, or null otherwise. */
  private _extractTaskId(route: string | null): number | null {
    if (!route) return null;
    const match = route.match(/\/cfs\/task\/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  private _emitForItem(item: SidebarNavItem, taskId: number | null): void {
    const route = item.route ?? '';
    const key   = item.menuKey ?? '';
    if (route === '/' || key === 'home') {
      this.welcomeSelected.emit();
    } else if (route.startsWith('/admin/modules') || key === 'moduli') {
      this.moduliSelected.emit();
    } else if (route.startsWith('/admin/users') || key === 'users') {
      this.usersSelected.emit();
    } else if (route.startsWith('/admin/nav') || key === 'nav') {
      this.navManagerSelected.emit();
    } else if (route.startsWith('/cfs') || key === 'cfs-report') {
      this.cfsReportSelected.emit(taskId);
    } else if (route === '/esg-reports' || key === 'esg-reports') {
      this.esgReportsSelected.emit();
    } else if (route.startsWith('/esg-task/')) {
      // NavigationItem child pointing to a specific ESG published task
      const tid = parseInt(route.split('/').pop() ?? '', 10);
      const task = this.esgTasks.find((t) => t.taskId === tid);
      if (task) {
        this.activeEsgTaskId = task.taskId;
        this.esgTaskSelected.emit({ taskId: task.taskId, label: task.label, defaultFilters: task.defaultFilters ?? null });
      }
    } else if (route.startsWith('/esg') || key === 'esg-configurator') {
      this.esgConfiguratorSelected.emit();
    } else {
      this.welcomeSelected.emit();
    }
  }

  isNavItemActive(item: SidebarNavItem): boolean {
    // Child item (has parentId): active only when explicitly selected
    if (item.parentId !== null && item.parentId !== undefined) {
      return this.activeChildId === item.id;
    }
    // Top-level item with children: active when one of its children is selected
    if (item.children && item.children.length > 0) {
      return item.children.some(c => this.activeChildId === c.id);
    }
    // Standard top-level items
    const route = item.route ?? '';
    const key   = item.menuKey ?? '';
    if (route === '/' || key === 'home') return this.activeView === 'welcome';
    if (route.startsWith('/admin/modules') || key === 'moduli') return this.activeView === 'moduli';
    if (route.startsWith('/admin/users') || key === 'users') return this.activeView === 'users';
    if (route.startsWith('/admin/nav') || key === 'nav') return this.activeView === 'nav-manager';
    if (route.startsWith('/cfs') || key === 'cfs-report') return this.activeView === 'cfs-report' && this.activeChildId === null;
    if (route === '/esg-reports' || key === 'esg-reports') return this.activeView === 'esg-reports' || this.activeView === 'esg-task';
    if (route.startsWith('/esg') || key === 'esg-configurator') return this.activeView === 'esg-configurator';
    return false;
  }

  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    if (this.collapsed) this.settingsOpen = false;
    this.collapsedChange.emit(this.collapsed);
  }

  toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
  }

  onLangChange(lang: string): void {
    this.selectedLang = lang;
    this.translate.use(lang);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (this.settingsOpen && !target.closest('app-sidebar')) {
      this.settingsOpen = false;
    }
  }

  get isAdmin(): boolean {
    if (!this.user) return true;
    return this.user.roles?.includes('ADMIN') ?? false;
  }

  get userInitials(): string    { return this.user?.initials ?? '?'; }
  get userDisplayName(): string { return this.user?.displayName ?? 'Utente'; }
  get userOrg(): string         { return 'MESA'; }
  get userRole(): string        { return this.user?.roles?.[0] ?? ''; }
}
