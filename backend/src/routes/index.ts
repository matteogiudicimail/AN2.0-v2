import { Router, Request, Response, NextFunction } from 'express';
import { authMesa } from '../middleware/authMesa';
import { mesaSecurityService } from '../services/mesa/securityService';

// ── CFS routes (existing) ─────────────────────────────────────────────────────
import healthRoutes        from './healthRoutes';
import authRoutes          from './authRoutes';
import dimensionRoutes     from './dimensionRoutes';
import reportRoutes        from './reportRoutes';
import writebackRoutes     from './writebackRoutes';
import auditRoutes         from './auditRoutes';
import permissionRoutes    from './permissionRoutes';
import configuratorRoutes  from './configuratorRoutes';
import hierarchyDefRoutes  from './hierarchyDefRoutes';
import taskRoutes          from './taskRoutes';
import paramTableRoutes    from './paramTableRoutes';
import entryLayoutRoutes   from './entryLayoutRoutes';
import dataEntryRoutes     from './dataEntryRoutes';
import rowApprovalRoutes   from './rowApprovalRoutes';
import masterDataRoutes    from './masterDataRoutes';
import snapshotRoutes      from './snapshotRoutes';

// ── MESA Data Collection routes ───────────────────────────────────────────────
import authMesaRoutes         from './mesa/authMesaRoutes';
import adminModulesRoutes     from './mesa/adminModulesRoutes';
import adminNavigationRoutes  from './mesa/adminNavigationRoutes';
import adminUsersRoutes       from './mesa/adminUsersRoutes';
import reportsRoutes          from './mesa/reportsRoutes';
import masterDataMesaRoutes   from './mesa/masterDataMesaRoutes';
import auditMesaRoutes        from './mesa/auditMesaRoutes';

const router = Router();

// ── /me — current MESA user profile ──────────────────────────────────────────
router.get('/me', authMesa, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.mesaUser!.sub;
    const user = await mesaSecurityService.findUserById(userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roles = user.userRoles.map((ur: any) => ur.role.code as string);
    res.json({
      id:          user.id,
      username:    user.username,
      displayName: user.displayName,
      initials:    user.initials,
      email:       user.email ?? undefined,
      roles,
    });
  } catch (err) { next(err); }
});

// ── CFS ───────────────────────────────────────────────────────────────────────
router.use('/health',       healthRoutes);
router.use('/auth',         authRoutes);
router.use('/dimensions',   dimensionRoutes);
router.use('/report',       reportRoutes);
router.use('/writeback',    writebackRoutes);
router.use('/audit',        auditRoutes);
router.use('/permissions',  permissionRoutes);
router.use('/configurator', configuratorRoutes);
router.use('/configurator', hierarchyDefRoutes);
router.use('/configurator', paramTableRoutes);
router.use('/configurator', entryLayoutRoutes);
router.use('/configurator', dataEntryRoutes);
router.use('/configurator', rowApprovalRoutes);
router.use('/configurator', masterDataRoutes);
router.use('/tasks',        taskRoutes);
router.use('/configurator', snapshotRoutes);

// ── MESA ──────────────────────────────────────────────────────────────────────
router.use('/auth',                  authMesaRoutes);   // POST /api/auth/login
router.use('/admin/modules',         adminModulesRoutes);
router.use('/admin/navigation',      adminNavigationRoutes);
router.use('/admin/users',           adminUsersRoutes);
router.use('/admin/roles',           adminUsersRoutes); // GET /api/admin/roles handled within
router.use('/reports',               reportsRoutes);
router.use('/master-data',           masterDataMesaRoutes);
router.use('/reports/:reportId/audit', auditMesaRoutes);

// Data entry + Excel routes are mounted with mergeParams — registered in server.ts
// to allow /api/reports/:reportId/sections/:sectionId/* pattern

export default router;
