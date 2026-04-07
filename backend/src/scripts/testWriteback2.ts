import { saveLeafDelta } from '../services/writeback/writebackService';
import { closePool } from '../config/db';

(async () => {
  // Exact same params the UI sends for task/4, AdjLevel mode, process 10000004
  const req = {
    rclAccountKey: '3000336_3000049_3_CAM00225.CAM00225.GE.nd',
    loadId:        10000004,   // C.F.S. 2025-12 Final
    entityId:      10003014,   // MESA
    scopeId:       3000176,    // scope 1
    currencyId:    3000052,    // EUR
    adjLevelId:    3000060,    // level 0
    newValue:      999,
    annotation:    'test UI script',
    currentVersion: 0,
  };
  console.log('Testing with loadId=10000004 (Final)...');
  const result = await saveLeafDelta(req, 'dev-user');
  console.log('Result:', JSON.stringify(result, null, 2));
  await closePool();
})().catch(e => { console.error('[ERROR]', e.message, e.stack); process.exit(1); });
