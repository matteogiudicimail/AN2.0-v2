/**
 * Migration 008 — Row Approval table
 *
 * Stores per-row approval flags for the data-entry grid.
 * Rows are identified by a sorted-JSON snapshot of their dimension values
 * (same format as cfg_WRITE_LOG.DimensionsJson).
 *
 * Using a separate table (not a column on _WRITE) because the _WRITE table
 * schema is dynamic (DDL generated per fact table). cfg_RowApproval is
 * schema-agnostic and works across all reports.
 */

IF OBJECT_ID('dbo.cfg_RowApproval', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_RowApproval (
    ApprovalId     INT            NOT NULL IDENTITY(1,1) CONSTRAINT PK_cfg_RowApproval PRIMARY KEY,
    ReportId       INT            NOT NULL,
    DimensionsJson NVARCHAR(MAX)  NOT NULL,
    IsApproved     BIT            NOT NULL CONSTRAINT DF_cfg_RowApproval_IsApproved DEFAULT 0,
    ApprovedBy     NVARCHAR(200)      NULL,
    ApprovedAt     DATETIME2          NULL,
    CONSTRAINT FK_cfg_RowApproval_Report
      FOREIGN KEY (ReportId) REFERENCES dbo.cfg_Report(ReportId)
  );

  CREATE NONCLUSTERED INDEX IX_cfg_RowApproval_Report
    ON dbo.cfg_RowApproval (ReportId)
    INCLUDE (DimensionsJson, IsApproved);
END
GO
