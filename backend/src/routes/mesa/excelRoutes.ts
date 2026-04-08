/**
 * Excel import/export for MESA data collection [V2: authMesa]
 * GET  /api/reports/:reportId/sections/:sectionId/excel/download
 * POST /api/reports/:reportId/sections/:sectionId/excel/upload
 * POST /api/reports/:reportId/sections/:sectionId/excel/confirm
 */
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authMesa } from '../../middleware/authMesa';
import { mesaExcelService } from '../../services/mesa/excelService';

const router = Router({ mergeParams: true });
router.use(authMesa);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB [OWASP]
  fileFilter: (_req, file, cb) => {
    const validMime = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const validExt  = file.originalname.endsWith('.xlsx');
    if (validMime || validExt) { cb(null, true); }
    else { cb(new Error('Solo file .xlsx accettati')); }
  },
});

router.get('/download', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const reportId  = parseInt(req.params['reportId']  ?? '', 10);
  const sectionId = parseInt(req.params['sectionId'] ?? '', 10);
  const userId    = req.mesaUser!.sub;
  if (isNaN(reportId) || isNaN(sectionId)) { res.status(400).json({ error: 'parametri non validi' }); return; }
  try {
    const { buffer, filename } = await mesaExcelService.generateTemplate(reportId, sectionId, userId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  } catch (err) { next(err); }
});

router.post('/upload', upload.single('file'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const reportId  = parseInt(req.params['reportId']  ?? '', 10);
  const sectionId = parseInt(req.params['sectionId'] ?? '', 10);
  const userId    = req.mesaUser!.sub;
  if (!req.file) { res.status(400).json({ error: 'File mancante' }); return; }
  if (isNaN(reportId) || isNaN(sectionId)) { res.status(400).json({ error: 'parametri non validi' }); return; }
  try { res.json(await mesaExcelService.parseImport(req.file.buffer, reportId, sectionId, userId)); } catch (err) { next(err); }
});

router.post('/confirm', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const reportId  = parseInt(req.params['reportId']  ?? '', 10);
  const sectionId = parseInt(req.params['sectionId'] ?? '', 10);
  const userId    = req.mesaUser!.sub;
  const changes   = (req.body as any)?.changes;
  if (isNaN(reportId) || isNaN(sectionId) || !Array.isArray(changes)) {
    res.status(400).json({ error: 'changes[] obbligatorio' }); return;
  }
  try { res.json(await mesaExcelService.confirmImport(reportId, sectionId, changes, userId)); } catch (err) { next(err); }
});

export default router;
