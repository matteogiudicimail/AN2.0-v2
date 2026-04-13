/**
 * fixStakeholderJoin.ts — Script di diagnostica e riparazione del join Stakeholder
 *
 * Uso: npx ts-node --transpile-only src/scripts/fixStakeholderJoin.ts [snapshotId]
 *
 * Il script:
 * 1. Legge lo snapshot (default: id=9) e il relativo binding/layout
 * 2. Trova i campi filtri con dimTable ma senza join in joinConfig
 * 3. Ispeziona la fact table e le dim table per trovare FK/PK automaticamente
 * 4. Aggiorna cfg_DatasetBinding.JoinConfig e cfg_Snapshot.BindingJson
 */

import '../config/env';  // carica .env
import { getPool, closePool } from '../config/db';
import * as sql from 'mssql';

async function main() {
  const snapshotId = parseInt(process.argv[2] ?? '9', 10);
  console.log(`\n=== fixStakeholderJoin — snapshot #${snapshotId} ===\n`);

  const pool = await getPool();

  // ── 1. Leggi snapshot ─────────────────────────────────────────────────────
  const snapRow = await pool.request()
    .input('id', sql.Int, snapshotId)
    .query(`SELECT SnapshotId, ReportId, TaskId, LayoutJson, BindingJson
            FROM dbo.cfg_Snapshot WHERE SnapshotId = @id`);

  if (!snapRow.recordset.length) {
    console.error(`Snapshot #${snapshotId} non trovato.`);
    process.exit(1);
  }

  const snap = snapRow.recordset[0];
  const layout   = JSON.parse(snap.LayoutJson);
  const binding  = JSON.parse(snap.BindingJson);
  const reportId = snap.ReportId;

  console.log(`Report ID : ${reportId}`);
  console.log(`Task ID   : ${snap.TaskId}`);
  console.log(`Fact Table: ${binding.factTable}`);
  console.log(`JoinConfig attuale (snapshot): ${JSON.stringify(binding.joinConfig, null, 2)}`);

  // ── 2. Leggi binding live da cfg_DatasetBinding ───────────────────────────
  const liveBinding = await pool.request()
    .input('rid', sql.Int, reportId)
    .query(`SELECT FactTable, FactTableSmartName, FieldMappings, JoinConfig
            FROM dbo.cfg_DatasetBinding WHERE ReportId = @rid`);

  if (!liveBinding.recordset.length) {
    console.error(`Nessun binding live per report ${reportId}.`);
    process.exit(1);
  }

  const liveBRow = liveBinding.recordset[0];
  const liveJoinConfig: any[] = liveBRow.JoinConfig ? JSON.parse(liveBRow.JoinConfig) : [];
  console.log(`\nJoinConfig live (cfg_DatasetBinding): ${JSON.stringify(liveJoinConfig, null, 2)}`);

  // ── 3. Trova campi filtri con dimTable ma senza join ──────────────────────
  const dimFiltri = (layout.filtri ?? []).filter(
    (f: any) => f.dimTable && !f.paramTableId
  );
  const dimRighe = (layout.righe ?? []).filter(
    (f: any) => f.dimTable && !f.paramTableId
  );

  console.log(`\nCampi filtri con dimTable: ${dimFiltri.map((f: any) => `${f.fieldName} → ${f.dimTable}`).join(', ') || 'nessuno'}`);
  console.log(`Campi righe con dimTable:  ${dimRighe.map((f: any) => `${f.fieldName} → ${f.dimTable}`).join(', ') || 'nessuno'}`);

  // ── 4. Ispeziona la fact table per trovare FK verso le dim ────────────────
  const [factSchema, factTable] = binding.factTable.includes('.')
    ? binding.factTable.split('.') : ['dbo', binding.factTable];

  console.log(`\nColonne della fact table [${factSchema}].[${factTable}]:`);
  const factCols = await pool.request().query(
    `SELECT COLUMN_NAME, DATA_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = '${factSchema}' AND TABLE_NAME = '${factTable}'
     ORDER BY ORDINAL_POSITION`
  );
  const factColNames = factCols.recordset.map((c: any) => c.COLUMN_NAME as string);
  console.log(factColNames.join(', '));

  // ── 5. Per ogni dim table mancante nel joinConfig, trova PK e FK ──────────
  const allDimFields = [...dimFiltri, ...dimRighe];
  const newJoins: any[] = [...liveJoinConfig];
  const missingDims: string[] = [];

  for (const f of allDimFields) {
    const dimTable: string = f.dimTable;
    const [dimSchema, dimTbl] = dimTable.includes('.') ? dimTable.split('.') : ['dbo', dimTable];

    // Controlla se esiste già nel joinConfig
    const alreadyJoined = liveJoinConfig.some(
      (j: any) => {
        const [, jTbl] = (j.rightTable ?? '').includes('.') ? j.rightTable.split('.') : ['dbo', j.rightTable];
        return jTbl.toLowerCase() === dimTbl.toLowerCase();
      }
    );
    if (alreadyJoined) {
      console.log(`\n✓ ${dimTable} già in joinConfig`);
      continue;
    }

    missingDims.push(dimTable);
    console.log(`\n✗ MANCANTE: ${dimTable}`);

    // Colonne della dim table
    const dimCols = await pool.request().query(
      `SELECT COLUMN_NAME, DATA_TYPE
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = '${dimSchema}' AND TABLE_NAME = '${dimTbl}'
       ORDER BY ORDINAL_POSITION`
    );
    const dimColNames = dimCols.recordset.map((c: any) => c.COLUMN_NAME as string);
    console.log(`  Colonne di ${dimTbl}: ${dimColNames.join(', ')}`);

    // PK della dim table
    const dimPks = await pool.request().query(
      `SELECT ku.COLUMN_NAME
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
       JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
         ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
        AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
       WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
         AND tc.TABLE_SCHEMA = '${dimSchema}'
         AND tc.TABLE_NAME = '${dimTbl}'`
    );
    const dimPkCols = dimPks.recordset.map((c: any) => c.COLUMN_NAME as string);
    console.log(`  PK di ${dimTbl}: ${dimPkCols.join(', ') || 'non trovata'}`);

    // FK verso questa dim nella fact table
    const fkQuery = await pool.request().query(
      `SELECT
         col1.name AS FK_COLUMN,
         col2.name AS REF_COLUMN
       FROM sys.foreign_keys fk
       JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
       JOIN sys.columns col1 ON col1.object_id = fkc.parent_object_id AND col1.column_id = fkc.parent_column_id
       JOIN sys.columns col2 ON col2.object_id = fkc.referenced_object_id AND col2.column_id = fkc.referenced_column_id
       JOIN sys.tables t1 ON t1.object_id = fk.parent_object_id
       JOIN sys.schemas s1 ON s1.schema_id = t1.schema_id
       JOIN sys.tables t2 ON t2.object_id = fk.referenced_object_id
       JOIN sys.schemas s2 ON s2.schema_id = t2.schema_id
       WHERE s1.name = '${factSchema}' AND t1.name = '${factTable}'
         AND s2.name = '${dimSchema}'  AND t2.name = '${dimTbl}'`
    );

    let leftKey: string | null = null;
    let rightKey: string | null = null;

    if (fkQuery.recordset.length) {
      leftKey  = fkQuery.recordset[0].FK_COLUMN;
      rightKey = fkQuery.recordset[0].REF_COLUMN;
      console.log(`  FK trovata: [${factTable}].[${leftKey}] → [${dimTbl}].[${rightKey}]`);
    } else {
      // Fallback: cerca colonne con nomi simili
      console.log(`  FK non trovata via sys.foreign_keys — cerco per nome colonna…`);
      const fieldNameLower = f.fieldName.toLowerCase();
      // cerca nella fact una colonna che potrebbe essere la FK
      const candidate = factColNames.find(col => {
        const colLower = col.toLowerCase();
        return colLower.includes('key') && (
          colLower.includes(dimTbl.replace(/[^a-z]/gi, '').toLowerCase()) ||
          colLower.includes(fieldNameLower)
        );
      }) ?? factColNames.find(col => col.toLowerCase() === fieldNameLower);

      if (candidate) {
        leftKey = candidate;
        rightKey = dimPkCols[0] ?? null;
        console.log(`  Candidato FK (per nome): [${factTable}].[${leftKey}] → [${dimTbl}].[${rightKey}]`);
      } else {
        console.log(`  ⚠ Impossibile determinare automaticamente la FK. Inserisci manualmente.`);
        console.log(`    Fact table columns: ${factColNames.join(', ')}`);
        console.log(`    Dim table columns:  ${dimColNames.join(', ')}`);
        continue;
      }
    }

    // Aggiungi il join
    if (leftKey && rightKey) {
      const newJoin = {
        leftKey,
        rightTable: dimTable,
        rightKey,
        joinType: 'LEFT',
      };
      newJoins.push(newJoin);
      console.log(`  ✓ Join aggiunto: ${JSON.stringify(newJoin)}`);
    }
  }

  // ── 6. Se ci sono join nuovi, aggiorna DB ─────────────────────────────────
  const addedCount = newJoins.length - liveJoinConfig.length;
  if (addedCount === 0) {
    console.log('\n✅ Nessun join mancante trovato. Il problema potrebbe essere altrove.');
    console.log('   Verifica che il campo Stakeholder nel layout abbia dimTable configurato.');
    await closePool();
    return;
  }

  console.log(`\n=== Aggiorno JoinConfig con ${addedCount} nuovo/i join ===`);

  // Aggiorna cfg_DatasetBinding
  await pool.request()
    .input('rid', sql.Int, reportId)
    .input('jc', sql.NVarChar(sql.MAX), JSON.stringify(newJoins))
    .query(`UPDATE dbo.cfg_DatasetBinding SET JoinConfig = @jc WHERE ReportId = @rid`);
  console.log(`✓ cfg_DatasetBinding aggiornato (report ${reportId})`);

  // Aggiorna il BindingJson congelato nello snapshot
  const newBindingJson = JSON.stringify({ ...binding, joinConfig: newJoins });
  await pool.request()
    .input('sid', sql.Int, snapshotId)
    .input('bj', sql.NVarChar(sql.MAX), newBindingJson)
    .query(`UPDATE dbo.cfg_Snapshot SET BindingJson = @bj WHERE SnapshotId = @sid`);
  console.log(`✓ cfg_Snapshot #${snapshotId} BindingJson aggiornato`);

  console.log(`\nNuovo JoinConfig:\n${JSON.stringify(newJoins, null, 2)}`);
  console.log(`\n✅ Completato. Testa il filtro Stakeholder nello snap #${snapshotId}.`);

  await closePool();
}

main().catch(err => {
  console.error('ERRORE:', err.message ?? err);
  process.exit(1);
});
