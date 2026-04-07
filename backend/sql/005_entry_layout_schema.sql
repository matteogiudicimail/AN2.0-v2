-- ============================================================
-- 005_entry_layout_schema.sql
-- Schema per il modulo Entry Layout (cfg_EntryLayout).
-- Idempotente: usa IF OBJECT_ID IS NULL.
-- ============================================================

-- ── cfg_EntryLayout ───────────────────────────────────────────
IF OBJECT_ID('dbo.cfg_EntryLayout', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_EntryLayout (
    LayoutId    INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    ReportId    INT           NOT NULL,
    ConfigJson  NVARCHAR(MAX) NOT NULL CONSTRAINT DF_cfg_EntryLayout_Config DEFAULT '{}',
    CreatedBy   NVARCHAR(128) NOT NULL,
    CreatedAt   DATETIME2     NOT NULL CONSTRAINT DF_cfg_EntryLayout_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedBy   NVARCHAR(128)     NULL,
    UpdatedAt   DATETIME2         NULL,
    CONSTRAINT FK_cfg_EntryLayout_Report
      FOREIGN KEY (ReportId) REFERENCES dbo.cfg_Report(ReportId),
    CONSTRAINT UQ_cfg_EntryLayout_Report
      UNIQUE (ReportId)
  );

  PRINT '[cfg] cfg_EntryLayout created';
END
ELSE
  PRINT '[cfg] cfg_EntryLayout already exists — skipped';
GO
