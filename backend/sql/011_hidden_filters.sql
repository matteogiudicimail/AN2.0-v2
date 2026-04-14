-- Migration 011: Add HiddenFilters column to cfg_Task
-- Run this script once against the target database before starting the backend.
-- The backend falls back gracefully if this column is absent (try/catch pattern).

IF COL_LENGTH('dbo.cfg_Task', 'HiddenFilters') IS NULL
BEGIN
  ALTER TABLE dbo.cfg_Task ADD HiddenFilters NVARCHAR(MAX) NULL;
  PRINT 'Column HiddenFilters added to cfg_Task.';
END
ELSE
BEGIN
  PRINT 'Column HiddenFilters already exists in cfg_Task — skipped.';
END
GO
