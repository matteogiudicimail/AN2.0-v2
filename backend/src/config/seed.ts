/**
 * Database seeder — runs on startup to apply schema and seed demo data.
 * Executes SQL files sequentially: schema first, then seed data.
 * Generates fact data programmatically for demo.
 *
 * Run standalone: npx ts-node src/config/seed.ts
 */
import fs from 'fs';
import path from 'path';
import { getPool, closePool } from './db';
import { dbAll, dbGet, dbRun } from './dbHelpers';

const SQL_DIR = path.resolve(__dirname, '../../sql');

function readSqlFile(filename: string): string {
  return fs.readFileSync(path.join(SQL_DIR, filename), 'utf-8');
}

/**
 * Executes a multi-statement SQL file by splitting on GO or semicolon batches.
 * SQL Server requires GO as batch separator for DDL statements.
 */
async function executeSqlFile(filename: string): Promise<void> {
  const pool = await getPool();
  const content = readSqlFile(filename);

  // Split on GO (case-insensitive) or run as single batch if no GO
  const batches = content
    .split(/^\s*GO\s*$/im)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  for (const batch of batches) {
    await pool.request().query(batch);
  }
}

// ── Fact data generation ──────────────────────────────────────────────────────

interface LeafAccount {
  rclKey: string;
  baseAmounts: [number, number, number];
}

const LEAF_ACCOUNTS: LeafAccount[] = [
  { rclKey: 'RCL01_01_01', baseAmounts: [2_000_000, 800_000,  400_000] },
  { rclKey: 'RCL01_01_02', baseAmounts: [  800_000, 300_000,  150_000] },
  { rclKey: 'RCL01_02',    baseAmounts: [  150_000,  50_000,   20_000] },
  { rclKey: 'RCL02_01_01', baseAmounts: [  700_000, 280_000,  140_000] },
  { rclKey: 'RCL02_01_02', baseAmounts: [  400_000, 150_000,   80_000] },
  { rclKey: 'RCL02_02_01', baseAmounts: [  200_000,  80_000,   40_000] },
  { rclKey: 'RCL02_02_02', baseAmounts: [  100_000,  40_000,   20_000] },
  { rclKey: 'RCL03_01_01', baseAmounts: [  250_000, 100_000,   50_000] },
  { rclKey: 'RCL03_01_02', baseAmounts: [  180_000,  70_000,   35_000] },
  { rclKey: 'RCL03_02',    baseAmounts: [  120_000,  40_000,   20_000] },
  { rclKey: 'RCL04_01',    baseAmounts: [   50_000,  15_000,    8_000] },
  { rclKey: 'RCL04_02',    baseAmounts: [   80_000,  25_000,   12_000] },
  { rclKey: 'RCL05_01',    baseAmounts: [  300_000, 120_000,   60_000] },
];

const PROCESSES = [
  { loadId: 101, factor: 0.95, adjLevelId: 1 },
  { loadId: 102, factor: 1.00, adjLevelId: 1 },
  { loadId: 103, factor: 1.05, adjLevelId: 1 },
  { loadId: 201, factor: 1.00, adjLevelId: 1 },
  { loadId: 202, factor: 1.00, adjLevelId: 1 },
  { loadId: 203, factor: 1.00, adjLevelId: 1 },
];

const ENTITIES = [
  { entityId: 100, idx: 0, costCenter: 'CC_CORP' },
  { entityId: 200, idx: 1, costCenter: 'CC_OPS'  },
  { entityId: 300, idx: 2, costCenter: 'CC_OPS'  },
];

async function generateFactData(): Promise<void> {
  const existing = await dbGet<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM dbo.tCFS_FactValue_Local_Cube'
  );
  if ((existing?.cnt ?? 0) > 0) {
    console.log(`[seed] Fact table already has ${existing?.cnt} rows — skipping`);
    return;
  }

  const pool = await getPool();
  const tx = pool.transaction();
  await tx.begin();

  try {
    let rowCount = 0;
    for (const account of LEAF_ACCOUNTS) {
      for (const entity of ENTITIES) {
        for (const proc of PROCESSES) {
          const amount = Math.round(account.baseAmounts[entity.idx] * proc.factor);
          const req = tx.request();
          await req.query(`
            INSERT INTO dbo.tCFS_FactValue_Local_Cube
              (LoadId, EntityId, DimAcc01Code, CurrencyId, RclAccountKey,
               AdjLevlId, AmountLocCurrency, AmountDocCurrency, ExchangeRate)
            VALUES
              (${proc.loadId}, ${entity.entityId}, '${entity.costCenter}',
               1, '${account.rclKey}', ${proc.adjLevelId}, ${amount}, ${amount}, 1.0)
          `);
          rowCount++;
        }
      }
    }
    await tx.commit();
    console.log(`[seed] Generated ${rowCount} fact rows`);
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function runSeed(): Promise<void> {
  console.log('[seed] Starting database initialisation...');

  try {
    await executeSqlFile('001_sqlserver_schema.sql');
    console.log('[seed] Schema applied');

    await executeSqlFile('002_sqlserver_seed.sql');
    console.log('[seed] Dimension data seeded');

    await executeSqlFile('003_configurator_schema.sql');
    console.log('[seed] Configurator schema applied');

    await executeSqlFile('004_param_table_schema.sql');
    console.log('[seed] Param table schema applied');

    await executeSqlFile('005_entry_layout_schema.sql');
    console.log('[seed] Entry layout schema applied');

    await executeSqlFile('008_row_approval.sql');
    console.log('[seed] Row approval schema applied');

    await executeSqlFile('009_master_data_config.sql');
    console.log('[seed] Master data registry schema applied');

    await generateFactData();

    console.log('[seed] Database initialisation complete');
  } catch (err) {
    console.error('[seed] Initialisation failed:', err);
    throw err;
  }
}

if (require.main === module) {
  runSeed()
    .then(() => closePool())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
