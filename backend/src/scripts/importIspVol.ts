/**
 * importIspVol.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Importa i dati dell'Excel ISP_Vol_DataModel_V1.xlsx nel database SQL Server
 * e configura il data model corrispondente nel configuratore ESG.
 *
 * Cosa fa:
 *   1. Crea le 4 tabelle (se non esistono) tramite DDL inline
 *   2. Svuota e ricarica i dati di ogni foglio
 *   3. Crea/aggiorna il record cfg_Report "ISP-VOL"
 *   4. Crea/aggiorna cfg_DatasetBinding con JoinConfig e FieldMappings
 *
 * Run:
 *   npm run importIspVol
 *   (oppure)
 *   ts-node -r tsconfig-paths/register src/scripts/importIspVol.ts
 *
 * Richiede le variabili DB_* nel file .env (stesse del server principale).
 * Il file Excel deve trovarsi nel path EXCEL_PATH (default: vedi sotto).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import 'dotenv/config';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import * as sql from 'mssql';

// ── Configurazione ────────────────────────────────────────────────────────────

const EXCEL_PATH = process.env['EXCEL_PATH']
  ?? path.join(process.env['USERPROFILE'] ?? 'C:/Users/Default', 'Downloads', 'ISP_Vol_DataModel_V1.xlsx');

const REPORT_CODE  = 'ISP-VOL';
const REPORT_LABEL = 'ISP Volumi V1';
const CREATED_BY   = 'importIspVol';

// ── Connessione SQL Server (stesse env del backend) ───────────────────────────

const winAuth = (process.env['DB_WINDOWS_AUTH'] ?? 'false').toLowerCase() === 'true';

const poolConfig: sql.config = {
  server:   process.env['DB_SERVER']   ?? 'localhost',
  database: process.env['DB_DATABASE'] ?? 'cfs_report',
  options: {
    trustServerCertificate: true,
    enableArithAbort:       true,
    ...(winAuth ? { trustedConnection: true } : {}),
  },
  ...(!winAuth ? {
    user:     process.env['DB_USER'],
    password: process.env['DB_PASSWORD'],
  } : {}),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Restituisce null se il valore è "(vuoto)", undefined, null o stringa vuota. */
function nullIfEmpty(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return (s === '' || s === '(vuoto)') ? null : s;
}

function toFloat(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

function toInt(v: unknown): number | null {
  if (v == null) return null;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

// ── Step 1: DDL (tabelle) ─────────────────────────────────────────────────────

async function ensureTables(pool: sql.ConnectionPool): Promise<void> {
  console.log('[DDL] Verifica/creazione tabelle...');

  await pool.request().query(`
    IF OBJECT_ID('dbo.tISP_Vol_DimKPI_V1','U') IS NULL
    BEGIN
      CREATE TABLE dbo.tISP_Vol_DimKPI_V1 (
        CodiceIRIDE             NVARCHAR(20)   NOT NULL CONSTRAINT PK_tISP_Vol_DimKPI PRIMARY KEY,
        StrutturaRefKPI         NVARCHAR(200)  NULL,
        DescrizioneKPI          NVARCHAR(1000) NULL,
        Stakeholder             NVARCHAR(100)  NULL,
        CodiceHFM               NVARCHAR(50)   NULL,
        FrequenzaAggiornamento  NVARCHAR(100)  NULL,
        GRI                     NVARCHAR(100)  NULL,
        MacroStakeholder        NVARCHAR(100)  NULL,
        UnitaDiMisura           NVARCHAR(100)  NULL,
        PrimarioCalcolato       NVARCHAR(50)   NULL,
        TipoKPI                 NVARCHAR(50)   NULL
      );
      PRINT '[OK] tISP_Vol_DimKPI_V1 creata';
    END
  `);

  await pool.request().query(`
    IF OBJECT_ID('dbo.tISP_Vol_DimTime_V1','U') IS NULL
    BEGIN
      CREATE TABLE dbo.tISP_Vol_DimTime_V1 (
        TempoID INT NOT NULL CONSTRAINT PK_tISP_Vol_DimTime PRIMARY KEY
      );
      PRINT '[OK] tISP_Vol_DimTime_V1 creata';
    END
  `);

  await pool.request().query(`
    IF OBJECT_ID('dbo.tISP_Vol_DimEntity_V1','U') IS NULL
    BEGIN
      CREATE TABLE dbo.tISP_Vol_DimEntity_V1 (
        EntityId           INT           NOT NULL IDENTITY(1,1) CONSTRAINT PK_tISP_Vol_DimEntity PRIMARY KEY,
        StrutturaRefEntita NVARCHAR(200) NULL,
        Entita             NVARCHAR(200) NOT NULL,
        CONSTRAINT UQ_tISP_Vol_DimEntity_Entita UNIQUE (Entita)
      );
      PRINT '[OK] tISP_Vol_DimEntity_V1 creata';
    END
  `);

  // La fact table dipende dalle 3 dimensioni → creare per ultima
  await pool.request().query(`
    IF OBJECT_ID('dbo.tISP_Vol_Fact_V1','U') IS NULL
    BEGIN
      CREATE TABLE dbo.tISP_Vol_Fact_V1 (
        FactId      BIGINT        NOT NULL IDENTITY(1,1) CONSTRAINT PK_tISP_Vol_Fact PRIMARY KEY,
        Entita      NVARCHAR(200) NOT NULL,
        Valore      FLOAT         NULL,
        CodiceIRIDE NVARCHAR(20)  NOT NULL,
        Tempo       INT           NOT NULL,
        CONSTRAINT FK_tISP_Vol_Fact_KPI    FOREIGN KEY (CodiceIRIDE) REFERENCES dbo.tISP_Vol_DimKPI_V1(CodiceIRIDE),
        CONSTRAINT FK_tISP_Vol_Fact_Time   FOREIGN KEY (Tempo)       REFERENCES dbo.tISP_Vol_DimTime_V1(TempoID),
        CONSTRAINT FK_tISP_Vol_Fact_Entity FOREIGN KEY (Entita)      REFERENCES dbo.tISP_Vol_DimEntity_V1(Entita)
      );
      CREATE INDEX IX_tISP_Vol_Fact_KPI    ON dbo.tISP_Vol_Fact_V1 (CodiceIRIDE);
      CREATE INDEX IX_tISP_Vol_Fact_Time   ON dbo.tISP_Vol_Fact_V1 (Tempo);
      CREATE INDEX IX_tISP_Vol_Fact_Entity ON dbo.tISP_Vol_Fact_V1 (Entita);
      PRINT '[OK] tISP_Vol_Fact_V1 creata';
    END
  `);

  console.log('[DDL] OK');
}

// ── Step 2: Import DimKPI ─────────────────────────────────────────────────────

async function importDimKPI(pool: sql.ConnectionPool, ws: ExcelJS.Worksheet): Promise<void> {
  console.log('[DimKPI] Svuotamento...');
  // Svuotare prima la fact per rispettare i FK, poi riempire dim
  await pool.request().query(`DELETE FROM dbo.tISP_Vol_Fact_V1`);
  await pool.request().query(`DELETE FROM dbo.tISP_Vol_DimKPI_V1`);

  const table = new sql.Table('dbo.tISP_Vol_DimKPI_V1');
  table.create = false;
  table.columns.add('CodiceIRIDE',            sql.NVarChar(20),   { nullable: false });
  table.columns.add('StrutturaRefKPI',         sql.NVarChar(200),  { nullable: true  });
  table.columns.add('DescrizioneKPI',          sql.NVarChar(1000), { nullable: true  });
  table.columns.add('Stakeholder',             sql.NVarChar(100),  { nullable: true  });
  table.columns.add('CodiceHFM',               sql.NVarChar(50),   { nullable: true  });
  table.columns.add('FrequenzaAggiornamento',  sql.NVarChar(100),  { nullable: true  });
  table.columns.add('GRI',                     sql.NVarChar(100),  { nullable: true  });
  table.columns.add('MacroStakeholder',        sql.NVarChar(100),  { nullable: true  });
  table.columns.add('UnitaDiMisura',           sql.NVarChar(100),  { nullable: true  });
  table.columns.add('PrimarioCalcolato',       sql.NVarChar(50),   { nullable: true  });
  table.columns.add('TipoKPI',                 sql.NVarChar(50),   { nullable: true  });

  // Deduplica per CodiceIRIDE (ultima occorrenza vince)
  const kpiMap = new Map<string, unknown[]>();
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // header
    const v = row.values as unknown[];
    const codice = nullIfEmpty(v[1]);
    if (!codice) return;
    kpiMap.set(codice, v);
  });

  let duplicates = 0;
  for (const [codice, v] of kpiMap) {
    table.rows.add(
      codice,
      nullIfEmpty(v[2]),
      nullIfEmpty(v[3]),
      nullIfEmpty(v[4]),
      nullIfEmpty(v[5]),
      nullIfEmpty(v[6]),
      nullIfEmpty(v[7]),
      nullIfEmpty(v[8]),
      nullIfEmpty(v[9]),
      nullIfEmpty(v[10]),
      nullIfEmpty(v[11]),
    );
  }
  if (duplicates > 0) console.log(`[DimKPI] ${duplicates} duplicati rimossi`);

  await pool.request().bulk(table);
  console.log(`[DimKPI] ${kpiMap.size} righe importate`);
}

// ── Step 3: Import DimTime ────────────────────────────────────────────────────

async function importDimTime(pool: sql.ConnectionPool, ws: ExcelJS.Worksheet): Promise<void> {
  console.log('[DimTime] Svuotamento...');
  await pool.request().query(`DELETE FROM dbo.tISP_Vol_DimTime_V1`);

  const table = new sql.Table('dbo.tISP_Vol_DimTime_V1');
  table.create = false;
  table.columns.add('TempoID', sql.Int, { nullable: false });

  let count = 0;
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const v = row.values as unknown[];
    const tempoId = toInt(v[1]);
    if (tempoId == null) return;
    table.rows.add(tempoId);
    count++;
  });

  await pool.request().bulk(table);
  console.log(`[DimTime] ${count} righe importate`);
}

// ── Step 4: Import DimEntity ──────────────────────────────────────────────────

async function importDimEntity(pool: sql.ConnectionPool, ws: ExcelJS.Worksheet): Promise<void> {
  console.log('[DimEntity] Svuotamento...');
  await pool.request().query(`DELETE FROM dbo.tISP_Vol_DimEntity_V1`);
  // Resetta l'identity dopo il delete
  await pool.request().query(`DBCC CHECKIDENT ('dbo.tISP_Vol_DimEntity_V1', RESEED, 0)`);

  // Inserimento row-by-row perché ha IDENTITY — no bulk senza identity insert
  // Collect rows deduplicando per Entita (ultima occorrenza vince)
  const entityMap = new Map<string, string | null>();
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const v = row.values as unknown[];
    const entita = nullIfEmpty(v[2]);
    if (!entita) return;
    entityMap.set(entita, nullIfEmpty(v[1]));
  });
  const rows: Array<{ struttura: string | null; entita: string }> = [];
  for (const [entita, struttura] of entityMap) {
    rows.push({ struttura, entita });
  }

  // Batch INSERT in gruppi da 500
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = chunk.map((_, j) => `(@s${i + j}, @e${i + j})`).join(',\n    ');
    const r = pool.request();
    chunk.forEach((item, j) => {
      r.input(`s${i + j}`, sql.NVarChar(200), item.struttura);
      r.input(`e${i + j}`, sql.NVarChar(200), item.entita);
    });
    await r.query(`
      INSERT INTO dbo.tISP_Vol_DimEntity_V1 (StrutturaRefEntita, Entita)
      VALUES ${values}
    `);
  }

  console.log(`[DimEntity] ${rows.length} righe importate`);
}

// ── Step 5: Import Fact ───────────────────────────────────────────────────────

async function importFact(pool: sql.ConnectionPool, ws: ExcelJS.Worksheet): Promise<void> {
  console.log('[Fact] Svuotamento...');
  await pool.request().query(`DELETE FROM dbo.tISP_Vol_Fact_V1`);
  await pool.request().query(`DBCC CHECKIDENT ('dbo.tISP_Vol_Fact_V1', RESEED, 0)`);

  const table = new sql.Table('dbo.tISP_Vol_Fact_V1');
  table.create = false;
  table.columns.add('Entita',      sql.NVarChar(200), { nullable: false });
  table.columns.add('Valore',      sql.Float,         { nullable: true  });
  table.columns.add('CodiceIRIDE', sql.NVarChar(20),  { nullable: false });
  table.columns.add('Tempo',       sql.Int,           { nullable: false });

  let count = 0;
  let skipped = 0;

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const v = row.values as unknown[];
    const entita  = nullIfEmpty(v[1]);
    const valore  = toFloat(v[2]);
    const codice  = nullIfEmpty(v[3]);
    const tempo   = toInt(v[4]);
    if (!entita || !codice || tempo == null) { skipped++; return; }
    table.rows.add(entita, valore, codice, tempo);
    count++;
  });

  await pool.request().bulk(table);
  console.log(`[Fact] ${count} righe importate${skipped > 0 ? `, ${skipped} saltate` : ''}`);
}

// ── Step 6: Configura il data model nel configuratore ESG ─────────────────────

async function configureDataModel(pool: sql.ConnectionPool): Promise<void> {
  console.log('[DataModel] Configurazione cfg_Report + cfg_DatasetBinding...');

  const now = new Date().toISOString();

  // Upsert cfg_Report
  const existingReport = await pool.request()
    .input('code', sql.NVarChar(50), REPORT_CODE)
    .query<{ ReportId: number }>(
      `SELECT ReportId FROM dbo.cfg_Report WHERE ReportCode = @code AND IsActive = 1`
    );

  let reportId: number;

  if (existingReport.recordset.length > 0) {
    reportId = existingReport.recordset[0].ReportId;
    await pool.request()
      .input('id',    sql.Int,          reportId)
      .input('label', sql.NVarChar(200), REPORT_LABEL)
      .input('desc',  sql.NVarChar(sql.MAX), 'Data model ISP Volumi — importato da ISP_Vol_DataModel_V1.xlsx')
      .input('by',    sql.NVarChar(100), CREATED_BY)
      .input('at',    sql.NVarChar(30),  now)
      .query(`
        UPDATE dbo.cfg_Report
        SET ReportLabel = @label, Description = @desc,
            UpdatedBy = @by, UpdatedAt = @at
        WHERE ReportId = @id
      `);
    console.log(`[DataModel] cfg_Report aggiornato (ReportId=${reportId})`);
  } else {
    const ins = await pool.request()
      .input('code',  sql.NVarChar(50),       REPORT_CODE)
      .input('label', sql.NVarChar(200),       REPORT_LABEL)
      .input('desc',  sql.NVarChar(sql.MAX),   'Data model ISP Volumi — importato da ISP_Vol_DataModel_V1.xlsx')
      .input('by',    sql.NVarChar(100),        CREATED_BY)
      .input('at',    sql.NVarChar(30),          now)
      .query<{ ReportId: number }>(`
        INSERT INTO dbo.cfg_Report
          (ReportCode, ReportLabel, Description, Domain, Category,
           Status, Version, WritebackMode, CreatedBy, CreatedAt, IsActive)
        OUTPUT INSERTED.ReportId
        VALUES (@code, @label, @desc, 'ESG', 'Volumi',
                'Draft', 1, 'Overwrite', @by, @at, 1)
      `);
    reportId = ins.recordset[0].ReportId;
    // Crea il layout di default
    await pool.request()
      .input('id', sql.Int, reportId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.cfg_ReportLayout WHERE ReportId = @id)
          INSERT INTO dbo.cfg_ReportLayout (ReportId) VALUES (@id)
      `);
    console.log(`[DataModel] cfg_Report creato (ReportId=${reportId})`);
  }

  // ── JoinConfig ──────────────────────────────────────────────────────────────
  // leftKey  = colonna nella fact table che è FK verso la dimensione
  // rightTable = nome qualificato della tabella dimensione
  // rightKey = colonna PK nella dimensione (usata nella JOIN ON)
  // smartName = alias leggibile (nome foglio senza prefisso/suffisso)
  const joinConfig = [
    {
      leftKey:    'CodiceIRIDE',
      rightTable: 'dbo.tISP_Vol_DimKPI_V1',
      rightKey:   'CodiceIRIDE',
      joinType:   'LEFT',
      smartName:  'DimKPI',
    },
    {
      leftKey:    'Tempo',
      rightTable: 'dbo.tISP_Vol_DimTime_V1',
      rightKey:   'TempoID',
      joinType:   'LEFT',
      smartName:  'DimTime',
    },
    {
      leftKey:    'Entita',
      rightTable: 'dbo.tISP_Vol_DimEntity_V1',
      rightKey:   'Entita',
      joinType:   'LEFT',
      smartName:  'DimEntity',
    },
  ];

  // ── FieldMappings ───────────────────────────────────────────────────────────
  const fieldMappings = [
    { dbField: 'Valore',      businessLabel: 'Valore',      fieldType: 'measure',   editable: true  },
    { dbField: 'CodiceIRIDE', businessLabel: 'Codice IRIDE', fieldType: 'dimension', editable: false },
    { dbField: 'Tempo',       businessLabel: 'Anno',         fieldType: 'period',    editable: false },
    { dbField: 'Entita',      businessLabel: 'Entità',       fieldType: 'dimension', editable: false },
  ];

  const jcJson = JSON.stringify(joinConfig);
  const fmJson = JSON.stringify(fieldMappings);

  const existingBinding = await pool.request()
    .input('rid', sql.Int, reportId)
    .query(`SELECT BindingId FROM dbo.cfg_DatasetBinding WHERE ReportId = @rid`);

  if (existingBinding.recordset.length > 0) {
    // Prova prima con FactTableSmartName, fallback senza
    try {
      await pool.request()
        .input('rid',  sql.Int,              reportId)
        .input('ft',   sql.NVarChar(200),    'dbo.tISP_Vol_Fact_V1')
        .input('ftsn', sql.NVarChar(200),    'Fact')
        .input('fm',   sql.NVarChar(sql.MAX), fmJson)
        .input('jc',   sql.NVarChar(sql.MAX), jcJson)
        .input('by',   sql.NVarChar(200),    CREATED_BY)
        .input('at',   sql.NVarChar(30),     now)
        .query(`
          UPDATE dbo.cfg_DatasetBinding
          SET FactTable = @ft, FactTableSmartName = @ftsn,
              FieldMappings = @fm, JoinConfig = @jc,
              UpdatedBy = @by, UpdatedAt = @at
          WHERE ReportId = @rid
        `);
    } catch {
      await pool.request()
        .input('rid', sql.Int,              reportId)
        .input('ft',  sql.NVarChar(200),    'dbo.tISP_Vol_Fact_V1')
        .input('fm',  sql.NVarChar(sql.MAX), fmJson)
        .input('jc',  sql.NVarChar(sql.MAX), jcJson)
        .input('by',  sql.NVarChar(200),    CREATED_BY)
        .input('at',  sql.NVarChar(30),     now)
        .query(`
          UPDATE dbo.cfg_DatasetBinding
          SET FactTable = @ft, FieldMappings = @fm, JoinConfig = @jc,
              UpdatedBy = @by, UpdatedAt = @at
          WHERE ReportId = @rid
        `);
    }
    console.log('[DataModel] cfg_DatasetBinding aggiornato');
  } else {
    try {
      await pool.request()
        .input('rid',  sql.Int,              reportId)
        .input('ft',   sql.NVarChar(200),    'dbo.tISP_Vol_Fact_V1')
        .input('ftsn', sql.NVarChar(200),    'Fact')
        .input('fm',   sql.NVarChar(sql.MAX), fmJson)
        .input('jc',   sql.NVarChar(sql.MAX), jcJson)
        .input('by',   sql.NVarChar(200),    CREATED_BY)
        .input('at',   sql.NVarChar(30),     now)
        .query(`
          INSERT INTO dbo.cfg_DatasetBinding
            (ReportId, FactTable, FactTableSmartName, FieldMappings, JoinConfig, CreatedBy, CreatedAt)
          VALUES (@rid, @ft, @ftsn, @fm, @jc, @by, @at)
        `);
    } catch {
      await pool.request()
        .input('rid', sql.Int,              reportId)
        .input('ft',  sql.NVarChar(200),    'dbo.tISP_Vol_Fact_V1')
        .input('fm',  sql.NVarChar(sql.MAX), fmJson)
        .input('jc',  sql.NVarChar(sql.MAX), jcJson)
        .input('by',  sql.NVarChar(200),    CREATED_BY)
        .input('at',  sql.NVarChar(30),     now)
        .query(`
          INSERT INTO dbo.cfg_DatasetBinding
            (ReportId, FactTable, FieldMappings, JoinConfig, CreatedBy, CreatedAt)
          VALUES (@rid, @ft, @fm, @jc, @by, @at)
        `);
    }
    console.log('[DataModel] cfg_DatasetBinding creato');
  }

  console.log(`[DataModel] OK — ReportId=${reportId}, ReportCode=${REPORT_CODE}`);
  console.log('[DataModel] Alias tabelle:');
  console.log('  tISP_Vol_Fact_V1      → Fact      (FactTableSmartName)');
  console.log('  tISP_Vol_DimKPI_V1    → DimKPI    (JoinConfig smartName)');
  console.log('  tISP_Vol_DimTime_V1   → DimTime   (JoinConfig smartName)');
  console.log('  tISP_Vol_DimEntity_V1 → DimEntity (JoinConfig smartName)');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('='.repeat(72));
  console.log('importIspVol — avvio');
  console.log(`Excel: ${EXCEL_PATH}`);
  console.log('='.repeat(72));

  // Connessione SQL Server
  const pool = await sql.connect(poolConfig);
  console.log(`[DB] Connesso a ${poolConfig.server}/${poolConfig.database}`);

  try {
    // Leggi Excel
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(EXCEL_PATH);
    console.log(`[Excel] Letti ${wb.worksheets.length} fogli`);

    const wsKPI    = wb.getWorksheet('tISP_Vol_DimKPI_V1');
    const wsTime   = wb.getWorksheet('tISP_Vol_DimTime_V1');
    const wsEntity = wb.getWorksheet('tISP_Vol_DimEntity_V1');
    const wsFact   = wb.getWorksheet('tISP_Vol_Fact_V1');

    if (!wsKPI || !wsTime || !wsEntity || !wsFact) {
      throw new Error('Fogli Excel non trovati. Verificare il file.');
    }

    // Step 1 — DDL
    await ensureTables(pool);

    // Step 2-5 — Import dati (ordine rispetta i FK: dim prima, fact dopo)
    await importDimKPI(pool, wsKPI);
    await importDimTime(pool, wsTime);
    await importDimEntity(pool, wsEntity);
    await importFact(pool, wsFact);

    // Step 6 — Configura data model
    await configureDataModel(pool);

    console.log('='.repeat(72));
    console.log('importIspVol — completato con successo');
    console.log('='.repeat(72));
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('[ERRORE]', err);
  process.exit(1);
});
