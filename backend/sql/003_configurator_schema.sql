-- ============================================================
-- 003_configurator_schema.sql
-- Schema per il modulo Configurator (cfg_* tables)
-- Idempotente: usa IF OBJECT_ID IS NULL per ogni oggetto.
-- Separatori GO per SQL Server.
-- ============================================================

-- ── cfg_Report ───────────────────────────────────────────────
IF OBJECT_ID('dbo.cfg_Report', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_Report (
    ReportId      INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    ReportCode    NVARCHAR(50)  NOT NULL,
    ReportLabel   NVARCHAR(200) NOT NULL,
    Description   NVARCHAR(MAX)     NULL,
    Domain        NVARCHAR(100)     NULL,
    Category      NVARCHAR(100)     NULL,
    Tags          NVARCHAR(500)     NULL,
    Owner         NVARCHAR(200)     NULL,
    Status        NVARCHAR(30)  NOT NULL CONSTRAINT DF_cfg_Report_Status  DEFAULT 'Draft',
    Version       INT           NOT NULL CONSTRAINT DF_cfg_Report_Version DEFAULT 1,
    WritebackMode NVARCHAR(20)  NOT NULL CONSTRAINT DF_cfg_Report_WbMode  DEFAULT 'Delta',
    IsActive      BIT           NOT NULL CONSTRAINT DF_cfg_Report_IsActive DEFAULT 1,
    CreatedBy     NVARCHAR(200) NOT NULL,
    CreatedAt     NVARCHAR(30)  NOT NULL,
    UpdatedBy     NVARCHAR(200)     NULL,
    UpdatedAt     NVARCHAR(30)      NULL,
    CONSTRAINT UQ_cfg_Report_Code UNIQUE (ReportCode)
  );
  PRINT '[cfg] cfg_Report created';
END
GO

-- ── cfg_DatasetBinding ───────────────────────────────────────
IF OBJECT_ID('dbo.cfg_DatasetBinding', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_DatasetBinding (
    BindingId     INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    ReportId      INT           NOT NULL,
    FactTable     NVARCHAR(200) NOT NULL,
    FieldMappings NVARCHAR(MAX)     NULL,  -- JSON array
    JoinConfig    NVARCHAR(MAX)     NULL,  -- JSON array
    CreatedBy     NVARCHAR(200) NOT NULL,
    CreatedAt     NVARCHAR(30)  NOT NULL,
    UpdatedBy     NVARCHAR(200)     NULL,
    UpdatedAt     NVARCHAR(30)      NULL,
    CONSTRAINT FK_cfg_DatasetBinding_Report
      FOREIGN KEY (ReportId) REFERENCES dbo.cfg_Report(ReportId),
    CONSTRAINT UQ_cfg_DatasetBinding_Report UNIQUE (ReportId)
  );
  PRINT '[cfg] cfg_DatasetBinding created';
END
GO

-- ── cfg_ReportRow ────────────────────────────────────────────
IF OBJECT_ID('dbo.cfg_ReportRow', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_ReportRow (
    RowId             INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    ReportId          INT           NOT NULL,
    RowCode           NVARCHAR(50)  NOT NULL,
    Label             NVARCHAR(200) NOT NULL,
    UnitOfMeasure     NVARCHAR(50)      NULL,
    RowType           NVARCHAR(30)  NOT NULL CONSTRAINT DF_cfg_ReportRow_Type DEFAULT 'Input',
    ParentRowCode     NVARCHAR(50)      NULL,
    IndentLevel       INT           NOT NULL CONSTRAINT DF_cfg_ReportRow_Indent DEFAULT 0,
    IsEditable        BIT           NOT NULL CONSTRAINT DF_cfg_ReportRow_Editable DEFAULT 1,
    IsVisible         BIT           NOT NULL CONSTRAINT DF_cfg_ReportRow_Visible DEFAULT 1,
    SortOrder         INT           NOT NULL CONSTRAINT DF_cfg_ReportRow_Sort   DEFAULT 0,
    MeasureField      NVARCHAR(100)     NULL,
    DimensionMembers  NVARCHAR(MAX)     NULL,  -- JSON
    SubtotalConfig    NVARCHAR(MAX)     NULL,  -- JSON
    SectionCode       NVARCHAR(50)      NULL,
    SubsectionCode    NVARCHAR(50)      NULL,
    -- CreatedBy/CreatedAt omessi dal service (upsert by RowCode): colonne nullable
    CreatedBy         NVARCHAR(200)     NULL,
    CreatedAt         NVARCHAR(30)      NULL,
    UpdatedBy         NVARCHAR(200)     NULL,
    UpdatedAt         NVARCHAR(30)      NULL,
    CONSTRAINT FK_cfg_ReportRow_Report
      FOREIGN KEY (ReportId) REFERENCES dbo.cfg_Report(ReportId),
    CONSTRAINT UQ_cfg_ReportRow_Code UNIQUE (ReportId, RowCode)
  );
  PRINT '[cfg] cfg_ReportRow created';
END
GO

-- ── cfg_ReportColumn ─────────────────────────────────────────
IF OBJECT_ID('dbo.cfg_ReportColumn', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_ReportColumn (
    ColumnId      INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    ReportId      INT           NOT NULL,
    ColumnCode    NVARCHAR(50)  NOT NULL,
    Label         NVARCHAR(200) NOT NULL,
    DimensionName NVARCHAR(100)     NULL,
    MemberKey     NVARCHAR(100)     NULL,
    IsSystem      BIT           NOT NULL CONSTRAINT DF_cfg_ReportColumn_Sys  DEFAULT 0,
    DefaultWidth  INT           NOT NULL CONSTRAINT DF_cfg_ReportColumn_W    DEFAULT 120,
    IsVisible     BIT           NOT NULL CONSTRAINT DF_cfg_ReportColumn_Vis  DEFAULT 1,
    SortOrder     INT           NOT NULL CONSTRAINT DF_cfg_ReportColumn_Sort DEFAULT 0,
    HeaderFormat  NVARCHAR(50)  NOT NULL CONSTRAINT DF_cfg_ReportColumn_Fmt  DEFAULT 'text',
    CONSTRAINT FK_cfg_ReportColumn_Report
      FOREIGN KEY (ReportId) REFERENCES dbo.cfg_Report(ReportId),
    CONSTRAINT UQ_cfg_ReportColumn_Code UNIQUE (ReportId, ColumnCode)
  );
  PRINT '[cfg] cfg_ReportColumn created';
END
GO

-- ── cfg_ReportFilter ─────────────────────────────────────────
IF OBJECT_ID('dbo.cfg_ReportFilter', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_ReportFilter (
    FilterId      INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    ReportId      INT           NOT NULL,
    FilterCode    NVARCHAR(50)  NOT NULL,
    Label         NVARCHAR(200) NOT NULL,
    DimensionName NVARCHAR(100) NOT NULL,
    IsVisible     BIT           NOT NULL CONSTRAINT DF_cfg_ReportFilter_Vis   DEFAULT 1,
    IsMultiSelect BIT           NOT NULL CONSTRAINT DF_cfg_ReportFilter_Multi DEFAULT 0,
    IsMandatory   BIT           NOT NULL CONSTRAINT DF_cfg_ReportFilter_Mand  DEFAULT 1,
    DefaultValue  NVARCHAR(200)     NULL,
    DependsOn     NVARCHAR(50)      NULL,
    SortOrder     INT           NOT NULL CONSTRAINT DF_cfg_ReportFilter_Sort  DEFAULT 0,
    -- CreatedBy/CreatedAt omessi dal service (upsert by FilterCode): colonne nullable
    CreatedBy     NVARCHAR(200)     NULL,
    CreatedAt     NVARCHAR(30)      NULL,
    UpdatedBy     NVARCHAR(200)     NULL,
    UpdatedAt     NVARCHAR(30)      NULL,
    CONSTRAINT FK_cfg_ReportFilter_Report
      FOREIGN KEY (ReportId) REFERENCES dbo.cfg_Report(ReportId),
    CONSTRAINT UQ_cfg_ReportFilter_Code UNIQUE (ReportId, FilterCode)
  );
  PRINT '[cfg] cfg_ReportFilter created';
END
GO

-- ── cfg_ReportSection ────────────────────────────────────────
IF OBJECT_ID('dbo.cfg_ReportSection', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_ReportSection (
    SectionId            INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    ReportId             INT           NOT NULL,
    SectionCode          NVARCHAR(50)  NOT NULL,
    Label                NVARCHAR(200) NOT NULL,
    Description          NVARCHAR(MAX)     NULL,
    ParentSectionCode    NVARCHAR(50)      NULL,
    SectionType          NVARCHAR(30)  NOT NULL CONSTRAINT DF_cfg_Section_Type    DEFAULT 'Section',
    LayoutStyle          NVARCHAR(30)  NOT NULL CONSTRAINT DF_cfg_Section_Layout  DEFAULT 'flat',
    IsCollapsible        BIT           NOT NULL CONSTRAINT DF_cfg_Section_Coll    DEFAULT 0,
    IsExpandedByDefault  BIT           NOT NULL CONSTRAINT DF_cfg_Section_Expand  DEFAULT 1,
    Icon                 NVARCHAR(100)     NULL,
    SortOrder            INT           NOT NULL CONSTRAINT DF_cfg_Section_Sort    DEFAULT 0,
    IsVisible            BIT           NOT NULL CONSTRAINT DF_cfg_Section_Vis     DEFAULT 1,
    -- CreatedBy/CreatedAt omessi dal service (upsert by SectionCode): colonne nullable
    CreatedBy            NVARCHAR(200)     NULL,
    CreatedAt            NVARCHAR(30)      NULL,
    UpdatedBy            NVARCHAR(200)     NULL,
    UpdatedAt            NVARCHAR(30)      NULL,
    CONSTRAINT FK_cfg_ReportSection_Report
      FOREIGN KEY (ReportId) REFERENCES dbo.cfg_Report(ReportId),
    CONSTRAINT UQ_cfg_ReportSection_Code UNIQUE (ReportId, SectionCode)
  );
  PRINT '[cfg] cfg_ReportSection created';
END
GO

-- ── cfg_ReportLayout ─────────────────────────────────────────
IF OBJECT_ID('dbo.cfg_ReportLayout', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_ReportLayout (
    LayoutId               INT          NOT NULL IDENTITY(1,1) PRIMARY KEY,
    ReportId               INT          NOT NULL,
    Density                NVARCHAR(20) NOT NULL CONSTRAINT DF_cfg_Layout_Density   DEFAULT 'standard',
    FrozenColumnCount      INT          NOT NULL CONSTRAINT DF_cfg_Layout_Frozen    DEFAULT 1,
    KpiColumnWidth         INT          NOT NULL CONSTRAINT DF_cfg_Layout_Kpi       DEFAULT 100,
    UmColumnWidth          INT          NOT NULL CONSTRAINT DF_cfg_Layout_Um        DEFAULT 60,
    MetadataColumnVisible  BIT          NOT NULL CONSTRAINT DF_cfg_Layout_Meta      DEFAULT 0,
    DefaultColumnWidth     INT          NOT NULL CONSTRAINT DF_cfg_Layout_ColW      DEFAULT 120,
    StickyHeader           BIT          NOT NULL CONSTRAINT DF_cfg_Layout_Sticky    DEFAULT 1,
    HoverHighlight         BIT          NOT NULL CONSTRAINT DF_cfg_Layout_Hover     DEFAULT 1,
    SubtotalHighlight      BIT          NOT NULL CONSTRAINT DF_cfg_Layout_Subtot    DEFAULT 1,
    ShowIndentation        BIT          NOT NULL CONSTRAINT DF_cfg_Layout_Indent    DEFAULT 1,
    EmptyValueStyle        NVARCHAR(20) NOT NULL CONSTRAINT DF_cfg_Layout_Empty     DEFAULT 'dash',
    AutosaveEnabled        BIT          NOT NULL CONSTRAINT DF_cfg_Layout_Autosave  DEFAULT 0,
    AutosaveDebounceMs     INT          NOT NULL CONSTRAINT DF_cfg_Layout_Debounce  DEFAULT 2000,
    SaveOnBlur             BIT          NOT NULL CONSTRAINT DF_cfg_Layout_SaveBlur  DEFAULT 1,
    AllowPivot             BIT          NOT NULL CONSTRAINT DF_cfg_Layout_Pivot     DEFAULT 0,
    PivotConfig            NVARCHAR(MAX)    NULL,  -- JSON
    UpdatedBy              NVARCHAR(200)    NULL,
    UpdatedAt              NVARCHAR(30)     NULL,
    CONSTRAINT FK_cfg_ReportLayout_Report
      FOREIGN KEY (ReportId) REFERENCES dbo.cfg_Report(ReportId),
    CONSTRAINT UQ_cfg_ReportLayout_Report UNIQUE (ReportId)
  );
  PRINT '[cfg] cfg_ReportLayout created';
END
GO

-- ── cfg_Task ─────────────────────────────────────────────────
IF OBJECT_ID('dbo.cfg_Task', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_Task (
    TaskId          INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    TaskCode        NVARCHAR(50)  NOT NULL,
    Label           NVARCHAR(200) NOT NULL,
    Description     NVARCHAR(MAX)     NULL,
    ReportId        INT           NOT NULL,
    ReportVersion   INT           NOT NULL CONSTRAINT DF_cfg_Task_Version DEFAULT 1,
    Status          NVARCHAR(30)  NOT NULL CONSTRAINT DF_cfg_Task_Status  DEFAULT 'Draft',
    WritebackMode   NVARCHAR(20)      NULL,
    ContextFilters  NVARCHAR(MAX)     NULL,  -- JSON object
    RouteUrl        NVARCHAR(500)     NULL,
    MenuItemCode    NVARCHAR(100)     NULL,
    AllowedRoles    NVARCHAR(500)     NULL,
    AllowedEntities NVARCHAR(MAX)     NULL,  -- JSON array
    IsActive        BIT           NOT NULL CONSTRAINT DF_cfg_Task_IsActive DEFAULT 1,
    CreatedBy       NVARCHAR(200) NOT NULL,
    CreatedAt       NVARCHAR(30)  NOT NULL,
    UpdatedBy       NVARCHAR(200)     NULL,
    UpdatedAt       NVARCHAR(30)      NULL,
    CONSTRAINT FK_cfg_Task_Report
      FOREIGN KEY (ReportId) REFERENCES dbo.cfg_Report(ReportId),
    CONSTRAINT UQ_cfg_Task_Code UNIQUE (TaskCode)
  );
  PRINT '[cfg] cfg_Task created';
END
GO

-- ── cfg_ConfigAudit ──────────────────────────────────────────
IF OBJECT_ID('dbo.cfg_ConfigAudit', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_ConfigAudit (
    AuditId     INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    EventType   NVARCHAR(100) NOT NULL,
    EntityType  NVARCHAR(50)  NOT NULL,
    EntityId    NVARCHAR(50)      NULL,
    ReportId    INT               NULL,
    TaskId      INT               NULL,
    OldSnapshot NVARCHAR(MAX)     NULL,  -- JSON
    NewSnapshot NVARCHAR(MAX)     NULL,  -- JSON
    ChangedBy   NVARCHAR(200) NOT NULL,
    ChangedAt   NVARCHAR(30)  NOT NULL,
    Notes       NVARCHAR(MAX)     NULL
  );

  CREATE INDEX IX_cfg_ConfigAudit_ReportId ON dbo.cfg_ConfigAudit (ReportId);
  CREATE INDEX IX_cfg_ConfigAudit_TaskId   ON dbo.cfg_ConfigAudit (TaskId);
  CREATE INDEX IX_cfg_ConfigAudit_ChangedAt ON dbo.cfg_ConfigAudit (ChangedAt);

  PRINT '[cfg] cfg_ConfigAudit created';
END
GO
