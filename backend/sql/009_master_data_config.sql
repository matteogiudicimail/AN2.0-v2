/**
 * Migration 009 — Master Data registry table
 *
 * cfg_MasterDataTable registers dimension/lookup tables that can be CRUD-managed
 * from the configurator UI. Only tables registered here can be accessed through
 * the master-data API (registry-as-whitelist pattern for OWASP A01/A03 defence).
 */

IF OBJECT_ID('dbo.cfg_MasterDataTable', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_MasterDataTable (
    MasterDataId   INT            NOT NULL IDENTITY(1,1) CONSTRAINT PK_cfg_MasterDataTable PRIMARY KEY,
    ReportId       INT            NOT NULL,
    SchemaName     NVARCHAR(128)  NOT NULL,
    TableName      NVARCHAR(128)  NOT NULL,
    Label          NVARCHAR(200)  NOT NULL,
    PrimaryKeyCol  NVARCHAR(128)  NOT NULL,
    -- JSON array of editable column names
    EditableCols   NVARCHAR(MAX)      NULL,
    CreatedBy      NVARCHAR(128)  NOT NULL,
    CreatedAt      DATETIME2      NOT NULL CONSTRAINT DF_cfg_MasterDataTable_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_cfg_MasterData_Report
      FOREIGN KEY (ReportId) REFERENCES dbo.cfg_Report(ReportId),
    CONSTRAINT UQ_cfg_MasterData_Table
      UNIQUE (ReportId, SchemaName, TableName)
  );
END
GO
