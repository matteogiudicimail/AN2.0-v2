-- ============================================================
-- 004_param_table_schema.sql
-- Schema per il modulo KPI Parameter Tables (cfg_ParamTable).
-- Idempotente: usa IF OBJECT_ID IS NULL.
-- ============================================================

-- ── cfg_ParamTable ────────────────────────────────────────────
IF OBJECT_ID('dbo.cfg_ParamTable', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_ParamTable (
    ParamTableId     INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,
    ReportId         INT            NOT NULL,
    SchemaName       NVARCHAR(128)  NOT NULL,
    FactTableName    NVARCHAR(128)  NOT NULL,
    ColumnName       NVARCHAR(128)  NOT NULL,
    ParamTableName   NVARCHAR(400)  NOT NULL,
    CustomColumnDefs NVARCHAR(MAX)      NULL,
    CreatedBy        NVARCHAR(128)  NOT NULL,
    CreatedAt        DATETIME2      NOT NULL CONSTRAINT DF_cfg_ParamTable_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_cfg_ParamTable_ReportColumn
      UNIQUE (ReportId, SchemaName, FactTableName, ColumnName)
  );

  CREATE INDEX IX_cfg_ParamTable_ReportId ON dbo.cfg_ParamTable(ReportId);

  PRINT '[cfg] cfg_ParamTable created';
END
ELSE
  PRINT '[cfg] cfg_ParamTable already exists — skipped';
GO
