-- =============================================================================
-- 004_isp_vol_tables.sql
-- Crea le 4 tabelle del data model ISP Volumi (star schema).
-- Eseguire una volta sul database principale (cfs_report).
-- Idempotente: usa IF NOT EXISTS per ogni oggetto.
-- =============================================================================

PRINT '=== 004_isp_vol_tables — inizio ===';

-- ── 1. Tabella dimensione KPI ────────────────────────────────────────────────
IF OBJECT_ID('dbo.tISP_Vol_DimKPI_V1', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tISP_Vol_DimKPI_V1 (
        CodiceIRIDE             NVARCHAR(20)   NOT NULL,
        StrutturaRefKPI         NVARCHAR(200)  NULL,
        DescrizioneKPI          NVARCHAR(1000) NULL,
        Stakeholder             NVARCHAR(100)  NULL,
        CodiceHFM               NVARCHAR(50)   NULL,
        FrequenzaAggiornamento  NVARCHAR(100)  NULL,
        GRI                     NVARCHAR(100)  NULL,
        MacroStakeholder        NVARCHAR(100)  NULL,
        UnitaDiMisura           NVARCHAR(100)  NULL,
        PrimarioCalcolato       NVARCHAR(50)   NULL,
        TipoKPI                 NVARCHAR(50)   NULL,
        CONSTRAINT PK_tISP_Vol_DimKPI PRIMARY KEY (CodiceIRIDE)
    );
    PRINT '[OK] tISP_Vol_DimKPI_V1 creata';
END
ELSE
    PRINT '[SKIP] tISP_Vol_DimKPI_V1 già esistente';

-- ── 2. Tabella dimensione Tempo ──────────────────────────────────────────────
IF OBJECT_ID('dbo.tISP_Vol_DimTime_V1', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tISP_Vol_DimTime_V1 (
        TempoID INT NOT NULL,
        CONSTRAINT PK_tISP_Vol_DimTime PRIMARY KEY (TempoID)
    );
    PRINT '[OK] tISP_Vol_DimTime_V1 creata';
END
ELSE
    PRINT '[SKIP] tISP_Vol_DimTime_V1 già esistente';

-- ── 3. Tabella dimensione Entità ─────────────────────────────────────────────
IF OBJECT_ID('dbo.tISP_Vol_DimEntity_V1', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tISP_Vol_DimEntity_V1 (
        EntityId           INT           NOT NULL IDENTITY(1,1),
        StrutturaRefEntita NVARCHAR(200) NULL,
        Entita             NVARCHAR(200) NOT NULL,
        CONSTRAINT PK_tISP_Vol_DimEntity  PRIMARY KEY (EntityId),
        CONSTRAINT UQ_tISP_Vol_DimEntity_Entita UNIQUE (Entita)
    );
    PRINT '[OK] tISP_Vol_DimEntity_V1 creata';
END
ELSE
    PRINT '[SKIP] tISP_Vol_DimEntity_V1 già esistente';

-- ── 4. Tabella fatto ─────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.tISP_Vol_Fact_V1', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tISP_Vol_Fact_V1 (
        FactId      BIGINT        NOT NULL IDENTITY(1,1),
        Entita      NVARCHAR(200) NOT NULL,
        Valore      FLOAT         NULL,
        CodiceIRIDE NVARCHAR(20)  NOT NULL,
        Tempo       INT           NOT NULL,
        CONSTRAINT PK_tISP_Vol_Fact PRIMARY KEY (FactId),
        CONSTRAINT FK_tISP_Vol_Fact_KPI
            FOREIGN KEY (CodiceIRIDE) REFERENCES dbo.tISP_Vol_DimKPI_V1(CodiceIRIDE),
        CONSTRAINT FK_tISP_Vol_Fact_Time
            FOREIGN KEY (Tempo) REFERENCES dbo.tISP_Vol_DimTime_V1(TempoID),
        CONSTRAINT FK_tISP_Vol_Fact_Entity
            FOREIGN KEY (Entita) REFERENCES dbo.tISP_Vol_DimEntity_V1(Entita)
    );
    CREATE INDEX IX_tISP_Vol_Fact_KPI    ON dbo.tISP_Vol_Fact_V1 (CodiceIRIDE);
    CREATE INDEX IX_tISP_Vol_Fact_Time   ON dbo.tISP_Vol_Fact_V1 (Tempo);
    CREATE INDEX IX_tISP_Vol_Fact_Entity ON dbo.tISP_Vol_Fact_V1 (Entita);
    PRINT '[OK] tISP_Vol_Fact_V1 creata';
END
ELSE
    PRINT '[SKIP] tISP_Vol_Fact_V1 già esistente';

PRINT '=== 004_isp_vol_tables — fine ===';
