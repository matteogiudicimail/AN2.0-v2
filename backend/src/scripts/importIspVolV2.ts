/**
 * importIspVolV2.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Importa i dati dell'Excel ISP_Vol_DataModel_V2.xlsx nel database SQL Server
 * e configura il data model corrispondente nel configuratore ESG.
 *
 * Differenze rispetto alla V1:
 *  - Chiavi composite nelle dimensioni:
 *      DimKPI   → KPIKey    = StrutturaRefKPI + '|' + CodiceIRIDE  (PK)
 *      DimEntity → EntityKey = StrutturaRefEntita + '|' + Entita    (PK)
 *  - Fact table usa KPIKey (FK→DimKPI) e KPIFiliale (FK→DimEntity.EntityKey)
 *  - TipoKPI rinominato in QuantQual (col 12: "Quant/Qual/Seminarrative")
 *  - Nuovo ReportCode: ISP-VOL-V2
 *
 * Run:
 *   npm run importIspVolV2
 *   (oppure)
 *   ts-node -r tsconfig-paths/register src/scripts/importIspVolV2.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */
import 'dotenv/config';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import * as sql from 'mssql';

// ── Configurazione ────────────────────────────────────────────────────────────

const EXCEL_PATH = process.env['EXCEL_PATH_V2']
  ?? path.join(process.env['USERPROFILE'] ?? 'C:/Users/Default', 'Downloads', 'ISP_Vol_DataModel_V2.xlsx');

const REPORT_CODE  = 'ISP-VOL-V2';
const REPORT_LABEL = 'ISP Volumi V2';
const CREATED_BY   = 'importIspVolV2';

// ── Connessione SQL Server ────────────────────────────────────────────────────

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

function nullIfEmpty(v: unknown): string | null {
  if (v == null) return null;
  // ExcelJS formula cell → prendi il result
  if (typeof v === 'object' && v !== null && 'result' in v) {
    return nullIfEmpty((v as { result: unknown }).result);
  }
  const s = String(v).trim();
  return (s === '' || s === '(vuoto)') ? null : s;
}

function toFloat(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'object' && v !== null && 'result' in v) return toFloat((v as { result: unknown }).result);
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

function toInt(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'object' && v !== null && 'result' in v) return toInt((v as { result: unknown }).result);
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

// ── Step 1: DDL ───────────────────────────────────────────────────────────────

async function ensureTables(pool: sql.ConnectionPool): Promise<void> {
  console.log('[DDL] Verifica/creazione tabelle V2...');

  await pool.request().query(`
    IF OBJECT_ID('dbo.tISP_Vol_DimKPI_V2','U') IS NULL
    BEGIN
      CREATE TABLE dbo.tISP_Vol_DimKPI_V2 (
        KPIKey                  NVARCHAR(300)  NOT NULL CONSTRAINT PK_tISP_Vol_DimKPI_V2 PRIMARY KEY,
        CodiceIRIDE             NVARCHAR(20)   NULL,
        StrutturaRefKPI         NVARCHAR(200)  NULL,
        DescrizioneKPI          NVARCHAR(1000) NULL,
        Stakeholder             NVARCHAR(100)  NULL,
        CodiceHFM               NVARCHAR(50)   NULL,
        FrequenzaAggiornamento  NVARCHAR(100)  NULL,
        GRI                     NVARCHAR(100)  NULL,
        MacroStakeholder        NVARCHAR(100)  NULL,
        UnitaDiMisura           NVARCHAR(100)  NULL,
        PrimarioCalcolato       NVARCHAR(50)   NULL,
        QuantQual               NVARCHAR(100)  NULL
      );
      PRINT '[OK] tISP_Vol_DimKPI_V2 creata';
    END
  `);

  await pool.request().query(`
    IF OBJECT_ID('dbo.tISP_Vol_DimTime_V2','U') IS NULL
    BEGIN
      CREATE TABLE dbo.tISP_Vol_DimTime_V2 (
        TempoID INT NOT NULL CONSTRAINT PK_tISP_Vol_DimTime_V2 PRIMARY KEY
      );
      PRINT '[OK] tISP_Vol_DimTime_V2 creata';
    END
  `);

  await pool.request().query(`
    IF OBJECT_ID('dbo.tISP_Vol_DimEntity_V2','U') IS NULL
    BEGIN
      CREATE TABLE dbo.tISP_Vol_DimEntity_V2 (
        EntityKey          NVARCHAR(500)  NOT NULL CONSTRAINT PK_tISP_Vol_DimEntity_V2 PRIMARY KEY,
        StrutturaRefEntita NVARCHAR(200)  NULL,
        Entita             NVARCHAR(300)  NULL
      );
      PRINT '[OK] tISP_Vol_DimEntity_V2 creata';
    END
  `);

  await pool.request().query(`
    IF OBJECT_ID('dbo.tISP_Vol_Fact_V2','U') IS NULL
    BEGIN
      CREATE TABLE dbo.tISP_Vol_Fact_V2 (
        FactId     BIGINT         NOT NULL IDENTITY(1,1) CONSTRAINT PK_tISP_Vol_Fact_V2 PRIMARY KEY,
        KPIKey     NVARCHAR(300)  NOT NULL,
        KPIFiliale NVARCHAR(500)  NOT NULL,
        Valore     FLOAT          NULL,
        Tempo      INT            NOT NULL,
        CONSTRAINT FK_tISP_Vol_Fact_V2_KPI    FOREIGN KEY (KPIKey)     REFERENCES dbo.tISP_Vol_DimKPI_V2(KPIKey),
        CONSTRAINT FK_tISP_Vol_Fact_V2_Entity FOREIGN KEY (KPIFiliale) REFERENCES dbo.tISP_Vol_DimEntity_V2(EntityKey),
        CONSTRAINT FK_tISP_Vol_Fact_V2_Time   FOREIGN KEY (Tempo)      REFERENCES dbo.tISP_Vol_DimTime_V2(TempoID)
      );
      CREATE INDEX IX_tISP_Vol_Fact_V2_KPI    ON dbo.tISP_Vol_Fact_V2 (KPIKey);
      CREATE INDEX IX_tISP_Vol_Fact_V2_Entity ON dbo.tISP_Vol_Fact_V2 (KPIFiliale);
      CREATE INDEX IX_tISP_Vol_Fact_V2_Time   ON dbo.tISP_Vol_Fact_V2 (Tempo);
      CREATE INDEX IX_tISP_Vol_Fact_V2_Cover  ON dbo.tISP_Vol_Fact_V2 (KPIKey, KPIFiliale, Tempo) INCLUDE (Valore);
      PRINT '[OK] tISP_Vol_Fact_V2 creata';
    END
  `);

  console.log('[DDL] OK');
}

// ── Step 2: Import DimKPI ─────────────────────────────────────────────────────
// Excel headers (1-based): KPIKey | CodiceIRIDE | StrutturaRefKPI | DescrizioneKPI |
//   Stakeholder | CodiceHFM | FrequenzaAggiornamento | GRI | MacroStakeholder |
//   UnitaDiMisura | PrimarioCalcolato | QuantQual

async function importDimKPI(pool: sql.ConnectionPool, ws: ExcelJS.Worksheet): Promise<void> {
  console.log('[DimKPI] Svuotamento...');
  await pool.request().query(`DELETE FROM dbo.tISP_Vol_Fact_V2`);
  await pool.request().query(`DELETE FROM dbo.tISP_Vol_DimKPI_V2`);

  const table = new sql.Table('dbo.tISP_Vol_DimKPI_V2');
  table.create = false;
  table.columns.add('KPIKey',                sql.NVarChar(300),  { nullable: false });
  table.columns.add('CodiceIRIDE',           sql.NVarChar(20),   { nullable: true  });
  table.columns.add('StrutturaRefKPI',       sql.NVarChar(200),  { nullable: true  });
  table.columns.add('DescrizioneKPI',        sql.NVarChar(1000), { nullable: true  });
  table.columns.add('Stakeholder',           sql.NVarChar(100),  { nullable: true  });
  table.columns.add('CodiceHFM',             sql.NVarChar(50),   { nullable: true  });
  table.columns.add('FrequenzaAggiornamento',sql.NVarChar(100),  { nullable: true  });
  table.columns.add('GRI',                   sql.NVarChar(100),  { nullable: true  });
  table.columns.add('MacroStakeholder',      sql.NVarChar(100),  { nullable: true  });
  table.columns.add('UnitaDiMisura',         sql.NVarChar(100),  { nullable: true  });
  table.columns.add('PrimarioCalcolato',     sql.NVarChar(50),   { nullable: true  });
  table.columns.add('QuantQual',             sql.NVarChar(100),  { nullable: true  });

  // Deduplica per KPIKey (chiave composita = StrutturaRefKPI|CodiceIRIDE)
  const kpiMap = new Map<string, sql.Table['rows'][0]>();
  let skipped = 0;

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // header
    const v = row.values as unknown[];

    // col1 = KPIKey (formula) — può essere oggetto ExcelJS formula
    const kpiKeyRaw = nullIfEmpty(v[1]);
    const codice    = nullIfEmpty(v[2]);
    const struttura = nullIfEmpty(v[3]);

    // Fallback: se KPIKey è null/vuoto (formula non calcolata) ricostruiscilo
    const kpiKey = kpiKeyRaw ?? (struttura && codice ? `${struttura}|${codice}` : null);
    if (!kpiKey) { skipped++; return; }

    kpiMap.set(kpiKey, [
      kpiKey,
      codice,
      struttura,
      nullIfEmpty(v[4]),   // DescrizioneKPI
      nullIfEmpty(v[5]),   // Stakeholder
      nullIfEmpty(v[6]),   // CodiceHFM
      nullIfEmpty(v[7]),   // FrequenzaAggiornamento
      nullIfEmpty(v[8]),   // GRI
      nullIfEmpty(v[9]),   // MacroStakeholder
      nullIfEmpty(v[10]),  // UnitaDiMisura
      nullIfEmpty(v[11]),  // PrimarioCalcolato
      nullIfEmpty(v[12]),  // QuantQual
    ]);
  });

  if (skipped > 0) console.log(`[DimKPI] ${skipped} righe senza KPIKey saltate`);

  for (const row of kpiMap.values()) {
    table.rows.add(...row);
  }

  await pool.request().bulk(table);
  console.log(`[DimKPI] ${kpiMap.size} righe importate`);
}

// ── Step 3: Import DimTime ────────────────────────────────────────────────────

async function importDimTime(pool: sql.ConnectionPool, ws: ExcelJS.Worksheet): Promise<void> {
  console.log('[DimTime] Svuotamento...');
  await pool.request().query(`DELETE FROM dbo.tISP_Vol_DimTime_V2`);

  const table = new sql.Table('dbo.tISP_Vol_DimTime_V2');
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
// Excel headers: StrutturaRefEntita | Entita | EntityKey (formula col3)

async function importDimEntity(pool: sql.ConnectionPool, ws: ExcelJS.Worksheet): Promise<void> {
  console.log('[DimEntity] Svuotamento...');
  await pool.request().query(`DELETE FROM dbo.tISP_Vol_DimEntity_V2`);

  // Deduplica per EntityKey
  const entityMap = new Map<string, { struttura: string | null; entita: string | null }>();
  let skipped = 0;

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const v = row.values as unknown[];

    const struttura    = nullIfEmpty(v[1]);   // STRUTTURA REF.ENTITA
    const entita       = nullIfEmpty(v[2]);   // Entità (Colonna A)
    const entityKeyRaw = nullIfEmpty(v[3]);   // EntityKey (formula)

    // Fallback: ricostruisci chiave se formula non è calcolata
    const entityKey = entityKeyRaw ?? (struttura && entita ? `${struttura}|${entita}` : null);
    if (!entityKey) { skipped++; return; }

    entityMap.set(entityKey, { struttura, entita });
  });

  if (skipped > 0) console.log(`[DimEntity] ${skipped} righe senza EntityKey saltate`);

  // Bulk insert tramite Table (nessuna IDENTITY — EntityKey è PK string)
  const table = new sql.Table('dbo.tISP_Vol_DimEntity_V2');
  table.create = false;
  table.columns.add('EntityKey',          sql.NVarChar(500), { nullable: false });
  table.columns.add('StrutturaRefEntita', sql.NVarChar(200), { nullable: true  });
  table.columns.add('Entita',             sql.NVarChar(300), { nullable: true  });

  for (const [key, { struttura, entita }] of entityMap) {
    table.rows.add(key, struttura, entita);
  }

  await pool.request().bulk(table);
  console.log(`[DimEntity] ${entityMap.size} righe importate`);
}

// ── Step 5: Import Fact ───────────────────────────────────────────────────────
// Excel headers: KPIKey | KPIFiliale | Valore | Tempo

async function importFact(pool: sql.ConnectionPool, ws: ExcelJS.Worksheet): Promise<void> {
  console.log('[Fact] Svuotamento...');
  await pool.request().query(`DELETE FROM dbo.tISP_Vol_Fact_V2`);
  await pool.request().query(`DBCC CHECKIDENT ('dbo.tISP_Vol_Fact_V2', RESEED, 0)`);

  const table = new sql.Table('dbo.tISP_Vol_Fact_V2');
  table.create = false;
  table.columns.add('KPIKey',     sql.NVarChar(300), { nullable: false });
  table.columns.add('KPIFiliale', sql.NVarChar(500), { nullable: false });
  table.columns.add('Valore',     sql.Float,         { nullable: true  });
  table.columns.add('Tempo',      sql.Int,           { nullable: false });

  let count   = 0;
  let skipped = 0;

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const v = row.values as unknown[];

    const kpiKey    = nullIfEmpty(v[1]);
    const kpiFiliale = nullIfEmpty(v[2]);
    const valore    = toFloat(v[3]);
    const tempo     = toInt(v[4]);

    if (!kpiKey || !kpiFiliale || tempo == null) { skipped++; return; }
    table.rows.add(kpiKey, kpiFiliale, valore, tempo);
    count++;
  });

  if (skipped > 0) console.log(`[Fact] ${skipped} righe saltate (chiavi mancanti)`);
  await pool.request().bulk(table);
  console.log(`[Fact] ${count} righe importate`);
}

// ── Step 6: Configura il data model ──────────────────────────────────────────

async function configureDataModel(pool: sql.ConnectionPool): Promise<void> {
  console.log('[DataModel] Configurazione cfg_Report + cfg_DatasetBinding...');

  const now = new Date().toISOString();

  // Upsert cfg_Report
  const existingReport = await pool.request()
    .input('code', sql.NVarChar(50), REPORT_CODE)
    .query<{ ReportId: number }>(
      `SELECT ReportId FROM dbo.cfg_Report WHERE ReportCode = @code AND IsActive = 1`,
    );

  let reportId: number;

  if (existingReport.recordset.length > 0) {
    reportId = existingReport.recordset[0].ReportId;
    await pool.request()
      .input('id',    sql.Int,              reportId)
      .input('label', sql.NVarChar(200),    REPORT_LABEL)
      .input('desc',  sql.NVarChar(sql.MAX), 'Data model ISP Volumi V2 — importato da ISP_Vol_DataModel_V2.xlsx')
      .input('by',    sql.NVarChar(100),    CREATED_BY)
      .input('at',    sql.NVarChar(30),     now)
      .query(`
        UPDATE dbo.cfg_Report
        SET ReportLabel = @label, Description = @desc,
            UpdatedBy = @by, UpdatedAt = @at
        WHERE ReportId = @id
      `);
    console.log(`[DataModel] cfg_Report aggiornato (ReportId=${reportId})`);
  } else {
    const ins = await pool.request()
      .input('code',  sql.NVarChar(50),     REPORT_CODE)
      .input('label', sql.NVarChar(200),    REPORT_LABEL)
      .input('desc',  sql.NVarChar(sql.MAX), 'Data model ISP Volumi V2 — importato da ISP_Vol_DataModel_V2.xlsx')
      .input('by',    sql.NVarChar(100),    CREATED_BY)
      .input('at',    sql.NVarChar(30),     now)
      .query<{ ReportId: number }>(`
        INSERT INTO dbo.cfg_Report
          (ReportCode, ReportLabel, Description, Domain, Category,
           Status, Version, WritebackMode, CreatedBy, CreatedAt, IsActive)
        OUTPUT INSERTED.ReportId
        VALUES (@code, @label, @desc, 'ESG', 'Volumi',
                'Draft', 1, 'Overwrite', @by, @at, 1)
      `);
    reportId = ins.recordset[0].ReportId;
    await pool.request()
      .input('id', sql.Int, reportId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.cfg_ReportLayout WHERE ReportId = @id)
          INSERT INTO dbo.cfg_ReportLayout (ReportId) VALUES (@id)
      `);
    console.log(`[DataModel] cfg_Report creato (ReportId=${reportId})`);
  }

  // ── JoinConfig ──────────────────────────────────────────────────────────────
  // Nota: DimTime NON è in JoinConfig (Tempo resta come campo diretto della fact)
  // perché il nome della colonna nella fact (Tempo) ≠ PK della dim (TempoID).
  const joinConfig = [
    {
      leftKey:    'KPIKey',
      rightTable: 'dbo.tISP_Vol_DimKPI_V2',
      rightKey:   'KPIKey',
      joinType:   'LEFT',
      smartName:  'DimKPI',
    },
    {
      leftKey:    'KPIFiliale',
      rightTable: 'dbo.tISP_Vol_DimEntity_V2',
      rightKey:   'EntityKey',
      joinType:   'LEFT',
      smartName:  'DimEntity',
    },
  ];

  // ── FieldMappings ───────────────────────────────────────────────────────────
  const fieldMappings = [
    { dbField: 'Valore',     businessLabel: 'Valore',     fieldType: 'measure',   editable: true  },
    { dbField: 'KPIKey',     businessLabel: 'KPI Key',    fieldType: 'dimension', editable: false },
    { dbField: 'KPIFiliale', businessLabel: 'Filiale',    fieldType: 'dimension', editable: false },
    { dbField: 'Tempo',      businessLabel: 'Anno',       fieldType: 'period',    editable: false },
  ];

  const jcJson = JSON.stringify(joinConfig);
  const fmJson = JSON.stringify(fieldMappings);

  const existingBinding = await pool.request()
    .input('rid', sql.Int, reportId)
    .query(`SELECT BindingId FROM dbo.cfg_DatasetBinding WHERE ReportId = @rid`);

  if (existingBinding.recordset.length > 0) {
    try {
      await pool.request()
        .input('rid',  sql.Int,              reportId)
        .input('ft',   sql.NVarChar(200),    'dbo.tISP_Vol_Fact_V2')
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
        .input('ft',  sql.NVarChar(200),    'dbo.tISP_Vol_Fact_V2')
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
        .input('ft',   sql.NVarChar(200),    'dbo.tISP_Vol_Fact_V2')
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
        .input('ft',  sql.NVarChar(200),    'dbo.tISP_Vol_Fact_V2')
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
  console.log('  tISP_Vol_Fact_V2      → Fact      (FactTableSmartName)');
  console.log('  tISP_Vol_DimKPI_V2    → DimKPI    (JoinConfig smartName)');
  console.log('  tISP_Vol_DimEntity_V2 → DimEntity (JoinConfig smartName)');

  return;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('='.repeat(72));
  console.log('importIspVolV2 — avvio');
  console.log(`Excel: ${EXCEL_PATH}`);
  console.log('='.repeat(72));

  const pool = await sql.connect(poolConfig);
  console.log(`[DB] Connesso a ${poolConfig.server}/${poolConfig.database}`);

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(EXCEL_PATH);
    console.log(`[Excel] Letti ${wb.worksheets.length} fogli: ${wb.worksheets.map(w => w.name).join(', ')}`);

    const wsKPI    = wb.getWorksheet('tISP_Vol_DimKPI_V2');
    const wsTime   = wb.getWorksheet('tISP_Vol_DimTime_V2');
    const wsEntity = wb.getWorksheet('tISP_Vol_DimEntity_V2');
    const wsFact   = wb.getWorksheet('tISP_Vol_Fact_V2');

    if (!wsKPI || !wsTime || !wsEntity || !wsFact) {
      const found = wb.worksheets.map(w => w.name).join(', ');
      throw new Error(`Fogli V2 non trovati. Trovati: [${found}]. Attesi: tISP_Vol_DimKPI_V2, tISP_Vol_DimTime_V2, tISP_Vol_DimEntity_V2, tISP_Vol_Fact_V2`);
    }

    await ensureTables(pool);
    await importDimKPI(pool, wsKPI);
    await importDimTime(pool, wsTime);
    await importDimEntity(pool, wsEntity);
    await importFact(pool, wsFact);
    await configureDataModel(pool);

    console.log('='.repeat(72));
    console.log('importIspVolV2 — completato con successo');
    console.log('='.repeat(72));
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('[ERRORE]', err);
  process.exit(1);
});
