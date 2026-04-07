import { getPool, closePool } from '../config/db';

(async () => {
  const pool = await getPool();

  // Sample vCFS_ReclassificationHierarchy
  const r1 = await pool.request().query(`SELECT TOP 3 * FROM vCFS_ReclassificationHierarchy`);
  console.log('vCFS_ReclassificationHierarchy sample:', JSON.stringify(r1.recordset));

  // Sample vCFS_Reclassification_SourceType
  const r2 = await pool.request().query(`SELECT TOP 3 * FROM vCFS_Reclassification_SourceType`);
  console.log('vCFS_Reclassification_SourceType sample:', JSON.stringify(r2.recordset));

  // Colonne di vCFS_FactValue_Local_Cube
  const r3 = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'vCFS_FactValue_Local_Cube'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('vCFS_FactValue_Local_Cube cols:', r3.recordset.map((c:any)=>c.COLUMN_NAME).join(', '));

  // View definition vCFS_Reclassification_SourceType
  const r4 = await pool.request().query(`
    SELECT VIEW_DEFINITION FROM INFORMATION_SCHEMA.VIEWS
    WHERE VIEW_NAME = 'vCFS_Reclassification_SourceType'
  `);
  console.log('SourceType def:', r4.recordset[0]?.VIEW_DEFINITION?.substring(0,300));

  await closePool();
})().catch(e => { console.error(e.message); process.exit(1); });
