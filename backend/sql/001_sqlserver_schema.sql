-- ============================================================
-- CFS Reporting — SQL Server Schema
-- Migrazione da SQLite a SQL Server on-prem.
-- Tutte le tabelle usano IF OBJECT_ID(...) IS NULL per idempotenza.
-- Eseguire come utente con ddl_admin o db_owner sul database target.
-- ============================================================

-- ── Utility: abilita FK enforcement ──────────────────────────────────────────
-- (SQL Server enforces FK by default; questo è documentativo)

-- ============================================================
-- SEZIONE 1 — Tabelle applicative esistenti (delta, audit, RBAC)
-- ============================================================

IF OBJECT_ID('dbo.app_Delta', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.app_Delta (
    DeltaId        INT           IDENTITY(1,1) PRIMARY KEY,
    LoadId         INT           NOT NULL,
    EntityId       INT           NOT NULL,
    RclAccountKey  NVARCHAR(100) NOT NULL,
    AdjLevelId     INT           NOT NULL,
    DimAcc01Code   NVARCHAR(50)  NULL,
    DimAcc02Code   NVARCHAR(50)  NULL,
    Counterpart    NVARCHAR(50)  NULL,
    CurrencyId     INT           NOT NULL,
    MeasureName    NVARCHAR(100) NOT NULL DEFAULT 'AmountLocCurrency',
    DeltaValue     DECIMAL(18,4) NOT NULL,
    IsSynthetic    BIT           NOT NULL DEFAULT 0,
    Annotation     NVARCHAR(MAX) NULL,
    CreatedBy      NVARCHAR(100) NOT NULL,
    CreatedAt      DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    UpdatedBy      NVARCHAR(100) NULL,
    UpdatedAt      DATETIME2     NULL,
    SessionId      NVARCHAR(100) NULL,
    IsActive       BIT           NOT NULL DEFAULT 1,
    SupersededBy   INT           NULL REFERENCES dbo.app_Delta(DeltaId),
    Version        INT           NOT NULL DEFAULT 1
  );
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_Delta_cell' AND object_id = OBJECT_ID('dbo.app_Delta'))
  CREATE INDEX idx_Delta_cell ON dbo.app_Delta (LoadId, EntityId, RclAccountKey, AdjLevelId, CurrencyId, IsActive);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_Delta_entity_process' AND object_id = OBJECT_ID('dbo.app_Delta'))
  CREATE INDEX idx_Delta_entity_process ON dbo.app_Delta (EntityId, LoadId, IsActive);

-- ── DeltaAudit ────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.app_DeltaAudit', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.app_DeltaAudit (
    AuditId                INT           IDENTITY(1,1) PRIMARY KEY,
    DeltaId                INT           NOT NULL REFERENCES dbo.app_Delta(DeltaId),
    LoadId                 INT           NOT NULL,
    EntityId               INT           NOT NULL,
    RclAccountKey          NVARCHAR(100) NOT NULL,
    AdjLevelId             INT           NOT NULL,
    DimAcc01Code           NVARCHAR(50)  NULL,
    DimAcc02Code           NVARCHAR(50)  NULL,
    Counterpart            NVARCHAR(50)  NULL,
    CurrencyId             INT           NOT NULL,
    MeasureName            NVARCHAR(100) NOT NULL,
    PreviousEffectiveValue DECIMAL(18,4) NULL,
    NewEffectiveValue      DECIMAL(18,4) NOT NULL,
    DeltaAmount            DECIMAL(18,4) NOT NULL,
    ModificationType       NVARCHAR(20)  NOT NULL CHECK (ModificationType IN ('INSERT','UPDATE','REVERT')),
    Annotation             NVARCHAR(MAX) NULL,
    ModifiedBy             NVARCHAR(100) NOT NULL,
    ModifiedAt             DATETIME2     NOT NULL DEFAULT GETUTCDATE()
  );
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_DeltaAudit_cell' AND object_id = OBJECT_ID('dbo.app_DeltaAudit'))
  CREATE INDEX idx_DeltaAudit_cell ON dbo.app_DeltaAudit (LoadId, EntityId, RclAccountKey, AdjLevelId, ModifiedAt);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_DeltaAudit_user' AND object_id = OBJECT_ID('dbo.app_DeltaAudit'))
  CREATE INDEX idx_DeltaAudit_user ON dbo.app_DeltaAudit (ModifiedBy, ModifiedAt);

-- ── SyntheticRclMember ────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.app_SyntheticRclMember', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.app_SyntheticRclMember (
    SyntheticKey NVARCHAR(200) PRIMARY KEY,
    ParentRclKey NVARCHAR(100) NOT NULL,
    Label        NVARCHAR(200) NOT NULL,
    CreatedBy    NVARCHAR(100) NOT NULL,
    CreatedAt    DATETIME2     NOT NULL DEFAULT GETUTCDATE()
  );
END

-- ── ProcessLock ───────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.app_ProcessLock', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.app_ProcessLock (
    LoadId     INT          PRIMARY KEY,
    IsLocked   BIT          NOT NULL DEFAULT 0,
    LockedBy   NVARCHAR(100) NULL,
    LockedAt   DATETIME2     NULL,
    UnlockedBy NVARCHAR(100) NULL,
    UnlockedAt DATETIME2     NULL
  );
END

-- ── UserPermission ────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.app_UserPermission', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.app_UserPermission (
    PermissionId INT           IDENTITY(1,1) PRIMARY KEY,
    UserId       NVARCHAR(100) NOT NULL,
    EntityId     INT           NOT NULL,
    Role         NVARCHAR(20)  NOT NULL CHECK (Role IN ('Viewer','Editor','Approver','Admin')),
    GrantedBy    NVARCHAR(100) NOT NULL,
    GrantedAt    DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT uq_UserPermission_UserEntity UNIQUE (UserId, EntityId)
  );
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_UserPermission_user' AND object_id = OBJECT_ID('dbo.app_UserPermission'))
  CREATE INDEX idx_UserPermission_user ON dbo.app_UserPermission (UserId);

-- ============================================================
-- SEZIONE 2 — Tabelle dimensionali CFS (demo data structure)
-- ============================================================

IF OBJECT_ID('dbo.tCFS_Entity', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tCFS_Entity (
    EntityId             INT           PRIMARY KEY,
    EntityCode           NVARCHAR(50)  NOT NULL UNIQUE,
    Entity               NVARCHAR(200) NOT NULL,
    ConsolidationGroupId INT           NULL,
    CountryCode          NVARCHAR(10)  NULL
  );
END

IF OBJECT_ID('dbo.tCFS_Process', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tCFS_Process (
    LoadId      INT           PRIMARY KEY,
    Process     NVARCHAR(100) NOT NULL,
    Scenario    NVARCHAR(50)  NOT NULL,
    StartDate   DATE          NOT NULL,
    EndDate     DATE          NOT NULL,
    Year        INT           NOT NULL,
    Month       NVARCHAR(10)  NOT NULL,
    RefPrevious INT           NULL
  );
END

IF OBJECT_ID('dbo.tCFS_Currency', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tCFS_Currency (
    CurrencyId   INT           PRIMARY KEY,
    CurrencyCode NVARCHAR(10)  NOT NULL UNIQUE,
    Currency     NVARCHAR(100) NOT NULL
  );
END

IF OBJECT_ID('dbo.tCFS_ScopeOfConsolidation', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tCFS_ScopeOfConsolidation (
    ScopeId   INT           PRIMARY KEY,
    ScopeCode NVARCHAR(50)  NOT NULL UNIQUE,
    Scope     NVARCHAR(200) NOT NULL
  );
END

IF OBJECT_ID('dbo.tCFS_AdjLevelHierarchy', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tCFS_AdjLevelHierarchy (
    AdjLevelId        INT           PRIMARY KEY,
    AdjLevel          NVARCHAR(100) NOT NULL,
    AdjLevelCode      NVARCHAR(50)  NOT NULL,
    AdjGroupTypeId    INT           NOT NULL,
    AdjGroupType      NVARCHAR(100) NOT NULL,
    AdjGroupTypeCode  NVARCHAR(50)  NOT NULL,
    AdjGroupId        INT           NOT NULL,
    AdjGroup          NVARCHAR(100) NOT NULL,
    AdjGroupCode      NVARCHAR(50)  NOT NULL,
    InLevelOrder      INT           NOT NULL DEFAULT 1
  );
END

IF OBJECT_ID('dbo.tCFS_Mapping_AdjLevel_ScopeId', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tCFS_Mapping_AdjLevel_ScopeId (
    AdjLevelId INT NOT NULL,
    ScopeId    INT NOT NULL,
    CONSTRAINT pk_AdjLevel_Scope PRIMARY KEY (AdjLevelId, ScopeId)
  );
END

IF OBJECT_ID('dbo.tCFS_AccDim01', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tCFS_AccDim01 (
    DimAcc01Code  NVARCHAR(50)  PRIMARY KEY,
    CostCenterCode NVARCHAR(50) NOT NULL,
    CostCenter    NVARCHAR(200) NOT NULL,
    CostCenterAggr NVARCHAR(100) NULL,
    Responsible   NVARCHAR(100) NULL
  );
END

IF OBJECT_ID('dbo.tCFS_DimAcc02', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tCFS_DimAcc02 (
    DimAcc02Code NVARCHAR(50)  PRIMARY KEY,
    CO           NVARCHAR(200) NOT NULL
  );
END

IF OBJECT_ID('dbo.tCFS_Reclassification_SourceType', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tCFS_Reclassification_SourceType (
    PathItem01 NVARCHAR(50) PRIMARY KEY,
    PLIs       INT          NOT NULL DEFAULT 0
  );
END

IF OBJECT_ID('dbo.tCFS_ReclassificationHierarchy', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tCFS_ReclassificationHierarchy (
    FolderChildKey       NVARCHAR(100) PRIMARY KEY,
    FolderFatherKey      NVARCHAR(100) NULL,
    Folder               NVARCHAR(200) NOT NULL,
    FolderCode           NVARCHAR(50)  NOT NULL,
    InLevelOrder         INT           NOT NULL DEFAULT 1,
    HierarchyMasterLevel INT           NOT NULL DEFAULT 1,
    PathItem01           NVARCHAR(100) NULL,
    PathItem02           NVARCHAR(100) NULL,
    PathItem03           NVARCHAR(100) NULL,
    PathItem04           NVARCHAR(100) NULL,
    PathItem05           NVARCHAR(100) NULL,
    L_h01                NVARCHAR(200) NULL,
    L_h02                NVARCHAR(200) NULL,
    L_h03                NVARCHAR(200) NULL,
    L_h04                NVARCHAR(200) NULL,
    L_h05                NVARCHAR(200) NULL,
    IsLeaf               BIT           NOT NULL DEFAULT 0
  );
END

IF OBJECT_ID('dbo.tCFS_FactValue_Local_Cube', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tCFS_FactValue_Local_Cube (
    FactId              INT           IDENTITY(1,1) PRIMARY KEY,
    LoadId              INT           NOT NULL,
    EntityId            INT           NOT NULL,
    DimAcc01Code        NVARCHAR(50)  NULL,
    DimAcc02Code        NVARCHAR(50)  NULL,
    CurrencyId          INT           NOT NULL DEFAULT 1,
    RclAccountKey       NVARCHAR(100) NOT NULL,
    AdjLevlId           INT           NOT NULL,
    Counterpart         NVARCHAR(50)  NULL,
    AmountLocCurrency   DECIMAL(18,4) NOT NULL DEFAULT 0,
    AmountDocCurrency   DECIMAL(18,4) NOT NULL DEFAULT 0,
    ExchangeRate        DECIMAL(10,6) NOT NULL DEFAULT 1,
    DocNo               NVARCHAR(100) NULL,
    MappingKey          NVARCHAR(100) NULL
  );
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_Fact_main' AND object_id = OBJECT_ID('dbo.tCFS_FactValue_Local_Cube'))
  CREATE INDEX idx_Fact_main ON dbo.tCFS_FactValue_Local_Cube (LoadId, EntityId, RclAccountKey, AdjLevlId, CurrencyId);

-- ============================================================
-- SEZIONE 3 — Tabelle Configuratore Report
-- ============================================================

IF OBJECT_ID('dbo.cfg_Report', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_Report (
    ReportId      INT           IDENTITY(1,1) PRIMARY KEY,
    ReportCode    NVARCHAR(50)  NOT NULL,
    ReportLabel   NVARCHAR(200) NOT NULL,
    Description   NVARCHAR(MAX) NULL,
    Domain        NVARCHAR(100) NULL,
    Category      NVARCHAR(100) NULL,
    Tags          NVARCHAR(500) NULL,
    Owner         NVARCHAR(100) NULL,
    Status        NVARCHAR(30)  NOT NULL DEFAULT 'Draft'
                    CHECK (Status IN ('Draft','ReadyForPublish','Published','Archived')),
    Version       INT           NOT NULL DEFAULT 1,
    WritebackMode NVARCHAR(20)  NOT NULL DEFAULT 'Overwrite'
                    CHECK (WritebackMode IN ('Delta','Overwrite')),
    CreatedBy     NVARCHAR(100) NOT NULL,
    CreatedAt     DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    UpdatedBy     NVARCHAR(100) NULL,
    UpdatedAt     DATETIME2     NULL,
    IsActive      BIT           NOT NULL DEFAULT 1,
    CONSTRAINT uq_cfg_Report_Code_Version UNIQUE (ReportCode, Version)
  );
END

IF OBJECT_ID('dbo.cfg_DatasetBinding', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_DatasetBinding (
    BindingId     INT           IDENTITY(1,1) PRIMARY KEY,
    ReportId      INT           NOT NULL REFERENCES dbo.cfg_Report(ReportId),
    FactTable     NVARCHAR(200) NOT NULL,
    FieldMappings NVARCHAR(MAX) NULL,   -- JSON
    JoinConfig    NVARCHAR(MAX) NULL,   -- JSON: relazioni tra tabelle
    CreatedBy     NVARCHAR(100) NOT NULL,
    CreatedAt     DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    UpdatedBy     NVARCHAR(100) NULL,
    UpdatedAt     DATETIME2     NULL
  );
END

IF OBJECT_ID('dbo.cfg_ReportRow', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_ReportRow (
    RowId             INT           IDENTITY(1,1) PRIMARY KEY,
    ReportId          INT           NOT NULL REFERENCES dbo.cfg_Report(ReportId),
    RowCode           NVARCHAR(50)  NOT NULL,
    Label             NVARCHAR(200) NOT NULL,
    UnitOfMeasure     NVARCHAR(50)  NULL,
    RowType           NVARCHAR(30)  NOT NULL DEFAULT 'Input'
                        CHECK (RowType IN ('Input','Subtotal','SectionHeader','Spacer','GroupParent')),
    ParentRowCode     NVARCHAR(50)  NULL,
    IndentLevel       INT           NOT NULL DEFAULT 0,
    IsEditable        BIT           NOT NULL DEFAULT 1,
    IsVisible         BIT           NOT NULL DEFAULT 1,
    SortOrder         INT           NOT NULL DEFAULT 0,
    MeasureField      NVARCHAR(100) NULL,
    DimensionMembers  NVARCHAR(MAX) NULL,  -- JSON
    SubtotalConfig    NVARCHAR(MAX) NULL,  -- JSON: {type, includedMembers}
    SectionCode       NVARCHAR(50)  NULL,
    SubsectionCode    NVARCHAR(50)  NULL,
    CONSTRAINT uq_cfg_Row_Code UNIQUE (ReportId, RowCode)
  );
END

IF OBJECT_ID('dbo.cfg_ReportColumn', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_ReportColumn (
    ColumnId      INT           IDENTITY(1,1) PRIMARY KEY,
    ReportId      INT           NOT NULL REFERENCES dbo.cfg_Report(ReportId),
    ColumnCode    NVARCHAR(50)  NOT NULL,
    Label         NVARCHAR(200) NOT NULL,
    DimensionName NVARCHAR(100) NULL,
    MemberKey     NVARCHAR(100) NULL,
    IsSystem      BIT           NOT NULL DEFAULT 0,
    DefaultWidth  INT           NOT NULL DEFAULT 120,
    IsVisible     BIT           NOT NULL DEFAULT 1,
    SortOrder     INT           NOT NULL DEFAULT 0,
    HeaderFormat  NVARCHAR(50)  NOT NULL DEFAULT 'Label',
    CONSTRAINT uq_cfg_Column_Code UNIQUE (ReportId, ColumnCode)
  );
END

IF OBJECT_ID('dbo.cfg_ReportFilter', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_ReportFilter (
    FilterId      INT           IDENTITY(1,1) PRIMARY KEY,
    ReportId      INT           NOT NULL REFERENCES dbo.cfg_Report(ReportId),
    FilterCode    NVARCHAR(50)  NOT NULL,
    Label         NVARCHAR(200) NOT NULL,
    DimensionName NVARCHAR(100) NOT NULL,
    IsVisible     BIT           NOT NULL DEFAULT 1,
    IsMultiSelect BIT           NOT NULL DEFAULT 0,
    IsMandatory   BIT           NOT NULL DEFAULT 0,
    DefaultValue  NVARCHAR(200) NULL,
    DependsOn     NVARCHAR(50)  NULL,
    SortOrder     INT           NOT NULL DEFAULT 0,
    CONSTRAINT uq_cfg_Filter_Code UNIQUE (ReportId, FilterCode)
  );
END

IF OBJECT_ID('dbo.cfg_ReportSection', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_ReportSection (
    SectionId          INT           IDENTITY(1,1) PRIMARY KEY,
    ReportId           INT           NOT NULL REFERENCES dbo.cfg_Report(ReportId),
    SectionCode        NVARCHAR(50)  NOT NULL,
    Label              NVARCHAR(200) NOT NULL,
    Description        NVARCHAR(MAX) NULL,
    ParentSectionCode  NVARCHAR(50)  NULL,
    SectionType        NVARCHAR(20)  NOT NULL DEFAULT 'Section'
                         CHECK (SectionType IN ('Section','Subsection')),
    LayoutStyle        NVARCHAR(20)  NOT NULL DEFAULT 'flat'
                         CHECK (LayoutStyle IN ('flat','grouped','collapsible')),
    IsCollapsible      BIT           NOT NULL DEFAULT 0,
    IsExpandedByDefault BIT          NOT NULL DEFAULT 1,
    Icon               NVARCHAR(50)  NULL,
    SortOrder          INT           NOT NULL DEFAULT 0,
    IsVisible          BIT           NOT NULL DEFAULT 1,
    CONSTRAINT uq_cfg_Section_Code UNIQUE (ReportId, SectionCode)
  );
END

IF OBJECT_ID('dbo.cfg_ReportLayout', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_ReportLayout (
    LayoutId              INT           IDENTITY(1,1) PRIMARY KEY,
    ReportId              INT           NOT NULL REFERENCES dbo.cfg_Report(ReportId),
    Density               NVARCHAR(20)  NOT NULL DEFAULT 'compact'
                            CHECK (Density IN ('compact','standard')),
    FrozenColumnCount     INT           NOT NULL DEFAULT 3,
    KpiColumnWidth        INT           NOT NULL DEFAULT 250,
    UmColumnWidth         INT           NOT NULL DEFAULT 60,
    MetadataColumnVisible BIT           NOT NULL DEFAULT 1,
    DefaultColumnWidth    INT           NOT NULL DEFAULT 120,
    StickyHeader          BIT           NOT NULL DEFAULT 1,
    HoverHighlight        BIT           NOT NULL DEFAULT 1,
    SubtotalHighlight     BIT           NOT NULL DEFAULT 1,
    ShowIndentation       BIT           NOT NULL DEFAULT 1,
    EmptyValueStyle       NVARCHAR(20)  NOT NULL DEFAULT 'blank',
    AutosaveEnabled       BIT           NOT NULL DEFAULT 1,
    AutosaveDebounceMs    INT           NOT NULL DEFAULT 1500,
    SaveOnBlur            BIT           NOT NULL DEFAULT 1,
    AllowPivot            BIT           NOT NULL DEFAULT 0,
    PivotConfig           NVARCHAR(MAX) NULL,  -- JSON: combinazioni pivot permesse
    CONSTRAINT uq_cfg_Layout_Report UNIQUE (ReportId)
  );
END

-- ============================================================
-- SEZIONE 4 — Task e Seaside
-- ============================================================

IF OBJECT_ID('dbo.cfg_Task', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_Task (
    TaskId          INT           IDENTITY(1,1) PRIMARY KEY,
    TaskCode        NVARCHAR(50)  NOT NULL,
    Label           NVARCHAR(200) NOT NULL,
    Description     NVARCHAR(MAX) NULL,
    ReportId        INT           NOT NULL REFERENCES dbo.cfg_Report(ReportId),
    ReportVersion   INT           NOT NULL DEFAULT 1,
    Status          NVARCHAR(20)  NOT NULL DEFAULT 'Draft'
                      CHECK (Status IN ('Draft','Active','Archived')),
    WritebackMode   NVARCHAR(20)  NULL,  -- override report default; NULL = usa quello del report
    ContextFilters  NVARCHAR(MAX) NULL,  -- JSON: {filterCode: value}
    RouteUrl        NVARCHAR(500) NULL,
    MenuItemCode    NVARCHAR(100) NULL,
    AllowedRoles    NVARCHAR(500) NULL,  -- comma-separated
    AllowedEntities NVARCHAR(MAX) NULL,  -- JSON array di EntityId
    CreatedBy       NVARCHAR(100) NOT NULL,
    CreatedAt       DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    UpdatedBy       NVARCHAR(100) NULL,
    UpdatedAt       DATETIME2     NULL,
    IsActive        BIT           NOT NULL DEFAULT 1,
    CONSTRAINT uq_cfg_Task_Code UNIQUE (TaskCode)
  );
END

-- ============================================================
-- SEZIONE 5 — Audit Configuratore
-- ============================================================

IF OBJECT_ID('dbo.cfg_ConfigAudit', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cfg_ConfigAudit (
    AuditId     INT           IDENTITY(1,1) PRIMARY KEY,
    EventType   NVARCHAR(50)  NOT NULL,
    EntityType  NVARCHAR(50)  NOT NULL,
    EntityId    NVARCHAR(100) NULL,
    ReportId    INT           NULL,
    TaskId      INT           NULL,
    OldSnapshot NVARCHAR(MAX) NULL,  -- JSON
    NewSnapshot NVARCHAR(MAX) NULL,  -- JSON
    ChangedBy   NVARCHAR(100) NOT NULL,
    ChangedAt   DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    Notes       NVARCHAR(MAX) NULL
  );
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_ConfigAudit_report' AND object_id = OBJECT_ID('dbo.cfg_ConfigAudit'))
  CREATE INDEX idx_ConfigAudit_report ON dbo.cfg_ConfigAudit (ReportId, ChangedAt);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_ConfigAudit_user' AND object_id = OBJECT_ID('dbo.cfg_ConfigAudit'))
  CREATE INDEX idx_ConfigAudit_user ON dbo.cfg_ConfigAudit (ChangedBy, ChangedAt);
