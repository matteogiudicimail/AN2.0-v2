-- ============================================================================
-- ESG Configurator v2 — Migration Script
-- Run once on each environment (dev / staging / prod).
-- All changes are additive (ALTER ADD / CREATE TABLE) — no DROP or RENAME.
-- ============================================================================

-- ── 1. cfg_DatasetBinding — add FactTableSmartName ──────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'cfg_DatasetBinding' AND COLUMN_NAME = 'FactTableSmartName'
)
BEGIN
  ALTER TABLE dbo.cfg_DatasetBinding
    ADD FactTableSmartName NVARCHAR(200) NULL;
  PRINT 'Added cfg_DatasetBinding.FactTableSmartName';
END
ELSE PRINT 'cfg_DatasetBinding.FactTableSmartName already exists — skipped';

-- ── 2. cfg_HierarchyDef_AN2 — new table for P&C hierarchy definitions ───────
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_NAME = 'cfg_HierarchyDef_AN2'
)
BEGIN
  CREATE TABLE dbo.cfg_HierarchyDef_AN2 (
    HierarchyDefId  INT IDENTITY(1,1)  NOT NULL  CONSTRAINT PK_HierarchyDef_AN2 PRIMARY KEY,
    BindingId       INT                NOT NULL,  -- FK → cfg_DatasetBinding.BindingId
    DimTable        NVARCHAR(200)      NOT NULL,  -- schema.table of the dim
    ChildKeyCol     NVARCHAR(128)      NOT NULL,  -- child key column name
    ParentKeyCol    NVARCHAR(128)      NOT NULL,  -- parent key column name
    LabelCol        NVARCHAR(128)      NOT NULL,  -- display label column name
    OrderCol        NVARCHAR(128)      NULL,      -- optional sort column
    SmartName       NVARCHAR(200)      NULL,      -- friendly name for the hierarchy
    CreatedBy       NVARCHAR(200)      NOT NULL  CONSTRAINT DF_HierarchyDef_AN2_CreatedBy DEFAULT (SYSTEM_USER),
    CreatedAt       DATETIME2(0)       NOT NULL  CONSTRAINT DF_HierarchyDef_AN2_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_HierarchyDef_AN2_Binding
      FOREIGN KEY (BindingId) REFERENCES dbo.cfg_DatasetBinding (BindingId)
      ON DELETE CASCADE
  );
  PRINT 'Created table cfg_HierarchyDef_AN2';
END
ELSE PRINT 'cfg_HierarchyDef_AN2 already exists — skipped';

-- ── 3. cfg_Task — add publish-related columns ────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'cfg_Task' AND COLUMN_NAME = 'DefaultFilters'
)
BEGIN
  ALTER TABLE dbo.cfg_Task ADD DefaultFilters NVARCHAR(MAX) NULL;
  PRINT 'Added cfg_Task.DefaultFilters';
END
ELSE PRINT 'cfg_Task.DefaultFilters already exists — skipped';

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'cfg_Task' AND COLUMN_NAME = 'RowOrder'
)
BEGIN
  ALTER TABLE dbo.cfg_Task ADD RowOrder NVARCHAR(MAX) NULL;
  PRINT 'Added cfg_Task.RowOrder';
END
ELSE PRINT 'cfg_Task.RowOrder already exists — skipped';

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'cfg_Task' AND COLUMN_NAME = 'ColumnOrder'
)
BEGIN
  ALTER TABLE dbo.cfg_Task ADD ColumnOrder NVARCHAR(MAX) NULL;
  PRINT 'Added cfg_Task.ColumnOrder';
END
ELSE PRINT 'cfg_Task.ColumnOrder already exists — skipped';

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'cfg_Task' AND COLUMN_NAME = 'ParentMenuCode'
)
BEGIN
  ALTER TABLE dbo.cfg_Task ADD ParentMenuCode NVARCHAR(100) NULL;
  PRINT 'Added cfg_Task.ParentMenuCode';
END
ELSE PRINT 'cfg_Task.ParentMenuCode already exists — skipped';

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'cfg_Task' AND COLUMN_NAME = 'AccessReaders'
)
BEGIN
  ALTER TABLE dbo.cfg_Task ADD AccessReaders NVARCHAR(MAX) NULL;
  PRINT 'Added cfg_Task.AccessReaders';
END
ELSE PRINT 'cfg_Task.AccessReaders already exists — skipped';

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'cfg_Task' AND COLUMN_NAME = 'AccessWriters'
)
BEGIN
  ALTER TABLE dbo.cfg_Task ADD AccessWriters NVARCHAR(MAX) NULL;
  PRINT 'Added cfg_Task.AccessWriters';
END
ELSE PRINT 'cfg_Task.AccessWriters already exists — skipped';

PRINT '';
PRINT '=== ESG Configurator v2 migration complete ===';
