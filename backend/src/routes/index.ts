import { Router } from 'express';
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

const router = Router();

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

export default router;
