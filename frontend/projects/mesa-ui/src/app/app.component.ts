import { Component, OnInit } from '@angular/core';
import { User } from './core/models/grid.model';
import { ApiService } from './core/services/api.service';
import { AuthService } from './core/services/auth.service';
import { environment } from '../environments/environment';
import { InputData } from 'cfs-report';

export type ActiveView = 'welcome' | 'moduli' | 'users' | 'nav-manager' | 'cfs-report' | 'esg-configurator' | 'esg-task' | 'esg-reports';

/**
 * Maps MESA roles to CFS roles.
 *
 * MESA roles (from seed): ADMIN, COORDINATOR, COMPILER
 * CFS roles (InputData.role): Viewer | Editor | Approver | Admin
 *
 * Mapping rationale:
 *   ADMIN       → Admin   (full CFS access)
 *   COORDINATOR → Approver (can review/approve writeback)
 *   COMPILER    → Editor   (can edit and submit writeback)
 *   (unknown)   → Viewer   (read-only, safe default)
 */
function mapMesaRoleToCfsRole(mesaRoles: string[]): string {
  if (mesaRoles.includes('ADMIN'))       return 'Admin';
  if (mesaRoles.includes('COORDINATOR')) return 'Approver';
  if (mesaRoles.includes('COMPILER'))    return 'Editor';
  return 'Viewer';
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  currentUser: User | null = null;
  activeView: ActiveView = 'welcome';
  sidebarCollapsed = false;
  activeTaskId: number | null = null;
  esgOpenReportId: number | null = null;
  activeEsgTaskId:    number | null = null;
  activeEsgTaskLabel = '';
  activeEsgTaskBreadcrumbs: string[] = [];

  constructor(
    private api: ApiService,
    public authService: AuthService,
  ) {}

  logout(): void {
    this.authService.logout();
    this.currentUser = null;
  }

  ngOnInit(): void {
    const fetchMe = () => {
      this.api.get<User>('/me').subscribe({
        next: user => {
          this.currentUser = user;
          this.api.setUserId(user.id);
        },
        error: () => {},
      });
    };

    if (this.authService.token) {
      fetchMe();
    } else {
      this.authService.login(environment.defaultUser, environment.defaultPassword).subscribe({
        next: () => fetchMe(),
        error: ()  => fetchMe(), // try /me anyway (X-User-Id fallback)
      });
    }
  }

  get cfsInputData(): InputData {
    return {
      token: this.authService.token ?? '',
      role: mapMesaRoleToCfsRole(this.currentUser?.roles ?? []),
      userId: this.currentUser ? String(this.currentUser.id) : '',
      taskId: this.activeTaskId ?? undefined,
    };
  }

  onNavWelcome():       void { this.activeView = 'welcome'; }
  onNavModuli():        void { this.activeView = 'moduli'; }
  onNavUsers():         void { this.activeView = 'users'; }
  onNavNavManager():    void { this.activeView = 'nav-manager'; }
  onNavCfsReport(taskId: number | null): void {
    this.activeTaskId = taskId;
    this.activeView = 'cfs-report';
  }
  /** Clicking "Reports" in the sidebar → goes to the published reports grid. */
  onNavEsgReports(): void { this.activeView = 'esg-reports'; }
  /** Clicking "Report Designer" in the sidebar → goes to the configurator wizard. */
  onNavEsgConfigurator(): void { this.esgOpenReportId = null; this.activeView = 'esg-configurator'; }
  /** Opens the configurator (from within the reports page, optionally for a specific report). */
  onOpenEsgConfigurator(reportId: number | null): void {
    this.esgOpenReportId = reportId;
    this.activeView = 'esg-configurator';
  }
  /** Opens the published-report snapshot view for a specific task (legacy nav-tree items). */
  onNavEsgTask(ev: { taskId: number; label: string; breadcrumbs?: string[] }): void {
    this.activeEsgTaskId          = ev.taskId;
    this.activeEsgTaskLabel       = ev.label;
    this.activeEsgTaskBreadcrumbs = ev.breadcrumbs ?? [];
    this.activeView = 'esg-task';
  }
}
