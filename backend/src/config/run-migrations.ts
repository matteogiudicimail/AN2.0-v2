/**
 * run-migrations.ts — Esegue solo le migrazioni mancanti (008, 009).
 * Usage: npx ts-node src/config/run-migrations.ts
 */
import fs from 'fs';
import path from 'path';
import { getPool, closePool } from './db';

const SQL_DIR = path.resolve(__dirname, '../../sql');

async function executeSqlFile(filename: string): Promise<void> {
  const pool = await getPool();
  const content = fs.readFileSync(path.join(SQL_DIR, filename), 'utf-8');
  const batches = content
    .split(/^\s*GO\s*$/im)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  for (const batch of batches) {
    await pool.request().query(batch);
  }
  console.log(`[migrate] Applied: ${filename}`);
}

async function main(): Promise<void> {
  console.log('[migrate] Running missing migrations...');
  try {
    await executeSqlFile('008_row_approval.sql');
    await executeSqlFile('009_master_data_config.sql');
    console.log('[migrate] All migrations applied successfully.');
  } catch (err) {
    console.error('[migrate] Error:', (err as Error).message);
    throw err;
  } finally {
    await closePool();
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(1));
