-- Migration 010: Add ParentMenuCode to cfg_Task + create cfg_Snapshot table
-- Run this script once against the target database before starting the backend.

-- ── 1. Add ParentMenuCode to cfg_Task (idempotent) ─────────────────────────────

IF COL_LENGTH('dbo.cfg_Task', 'ParentMenuCode') IS NULL
BEGIN
  ALTER TABLE dbo.cfg_Task ADD ParentMenuCode NVARCHAR(200) NULL;
  PRINT 'Column ParentMenuCode added to cfg_Task.';
END
ELSE
BEGIN
  PRINT 'Column ParentMenuCode already exists in cfg_Task — skipped.';
END
GO

-- ── 2. Create cfg_Snapshot (idempotent) ────────────────────────────────────────

IF OBJECT_ID('dbo.cfg_Snapshot', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_Snapshot (
    SnapshotId   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    TaskId       INT NOT NULL REFERENCES dbo.cfg_Task(TaskId),
    ReportId     INT NOT NULL,
    LayoutJson   NVARCHAR(MAX) NOT NULL,   -- frozen copy of cfg_EntryLayout.ConfigJson
    BindingJson  NVARCHAR(MAX) NOT NULL,   -- frozen copy of cfg_DatasetBinding (FactTable + JoinConfig)
    FilterValues NVARCHAR(MAX) NULL,       -- default filter values (JSON)
    CreatedBy    NVARCHAR(200) NOT NULL,
    CreatedAt    DATETIME2 NOT NULL CONSTRAINT DF_cfg_Snapshot_CreatedAt DEFAULT SYSUTCDATETIME(),
    IsActive     BIT NOT NULL CONSTRAINT DF_cfg_Snapshot_IsActive DEFAULT 1
  );
  PRINT 'Table cfg_Snapshot created.';
END
ELSE
BEGIN
  PRINT 'Table cfg_Snapshot already exists — skipped.';
END
GO
