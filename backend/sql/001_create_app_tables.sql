-- ============================================================
-- CFS Reporting & Writeback — Application tables
-- Target: SQLite (POC). Migrate to SQL Server for production.
-- ============================================================

-- ── Delta: every user writeback is a delta, never overwriting base data ───────
CREATE TABLE IF NOT EXISTS app_Delta (
    DeltaId        INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Cell coordinates (full grain)
    LoadId         INTEGER NOT NULL,
    EntityId       INTEGER NOT NULL,
    RclAccountKey  TEXT    NOT NULL,  -- natural leaf key OR synthetic key
    AdjLevelId     INTEGER NOT NULL,
    DimAcc01Code   TEXT,              -- NULL = context-wide (all cost centers)
    DimAcc02Code   TEXT,
    Counterpart    TEXT,
    CurrencyId     INTEGER NOT NULL,
    -- Measure and value
    MeasureName    TEXT    NOT NULL DEFAULT 'AmountLocCurrency',
    DeltaValue     REAL    NOT NULL,
    IsSynthetic    INTEGER NOT NULL DEFAULT 0, -- 1 = aggregate-level writeback
    -- Metadata
    Annotation     TEXT,
    CreatedBy      TEXT    NOT NULL,
    CreatedAt      TEXT    NOT NULL,  -- ISO 8601 UTC
    UpdatedBy      TEXT,
    UpdatedAt      TEXT,
    SessionId      TEXT,
    -- Lifecycle
    IsActive       INTEGER NOT NULL DEFAULT 1,
    SupersededBy   INTEGER REFERENCES app_Delta(DeltaId),
    -- Optimistic locking: Version increments on each UPDATE [OWASP A01]
    Version        INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_Delta_cell
    ON app_Delta (LoadId, EntityId, RclAccountKey, AdjLevelId, CurrencyId, IsActive);

CREATE INDEX IF NOT EXISTS idx_Delta_entity_process
    ON app_Delta (EntityId, LoadId, IsActive);

-- ── DeltaAudit: immutable audit trail — one row per change [F12] ──────────────
CREATE TABLE IF NOT EXISTS app_DeltaAudit (
    AuditId              INTEGER PRIMARY KEY AUTOINCREMENT,
    DeltaId              INTEGER NOT NULL REFERENCES app_Delta(DeltaId),
    -- Cell coordinates (denormalised for query convenience)
    LoadId               INTEGER NOT NULL,
    EntityId             INTEGER NOT NULL,
    RclAccountKey        TEXT    NOT NULL,
    AdjLevelId           INTEGER NOT NULL,
    DimAcc01Code         TEXT,
    DimAcc02Code         TEXT,
    Counterpart          TEXT,
    CurrencyId           INTEGER NOT NULL,
    MeasureName          TEXT    NOT NULL,
    -- Change record
    PreviousEffectiveValue REAL,
    NewEffectiveValue      REAL,
    DeltaAmount            REAL,
    ModificationType     TEXT    NOT NULL CHECK (ModificationType IN ('INSERT','UPDATE','REVERT')),
    Annotation           TEXT,
    -- Who / when [OWASP A09]
    ModifiedBy           TEXT    NOT NULL,
    ModifiedAt           TEXT    NOT NULL  -- ISO 8601 UTC
);

CREATE INDEX IF NOT EXISTS idx_DeltaAudit_cell
    ON app_DeltaAudit (LoadId, EntityId, RclAccountKey, AdjLevelId, ModifiedAt);

CREATE INDEX IF NOT EXISTS idx_DeltaAudit_user
    ON app_DeltaAudit (ModifiedBy, ModifiedAt);

-- ── SyntheticRclMember: fake leaf nodes for aggregate-level writeback [F06] ───
CREATE TABLE IF NOT EXISTS app_SyntheticRclMember (
    SyntheticKey   TEXT    PRIMARY KEY,   -- e.g. '_WB_RCL02_entityId_loadId'
    ParentRclKey   TEXT    NOT NULL,      -- FolderChildKey of the aggregate node
    Label          TEXT    NOT NULL,      -- shown in grid: "Manual Adj. — <parent>"
    CreatedBy      TEXT    NOT NULL,
    CreatedAt      TEXT    NOT NULL       -- ISO 8601 UTC
);

-- ── ProcessLock: controls whether writeback is allowed on a period [F15] ──────
CREATE TABLE IF NOT EXISTS app_ProcessLock (
    LoadId         INTEGER PRIMARY KEY,
    IsLocked       INTEGER NOT NULL DEFAULT 0,
    LockedBy       TEXT,
    LockedAt       TEXT,
    UnlockedBy     TEXT,
    UnlockedAt     TEXT
);

-- ── UserPermission: entity-level RBAC [F14, OWASP A01] ───────────────────────
CREATE TABLE IF NOT EXISTS app_UserPermission (
    PermissionId   INTEGER PRIMARY KEY AUTOINCREMENT,
    UserId         TEXT    NOT NULL,
    EntityId       INTEGER NOT NULL,
    Role           TEXT    NOT NULL CHECK (Role IN ('Viewer','Editor','Approver','Admin')),
    GrantedBy      TEXT    NOT NULL,
    GrantedAt      TEXT    NOT NULL,
    UNIQUE (UserId, EntityId)
);

CREATE INDEX IF NOT EXISTS idx_UserPermission_user
    ON app_UserPermission (UserId);

-- ── Report metadata ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_ReportDefinition (
    ReportId       INTEGER PRIMARY KEY AUTOINCREMENT,
    ReportName     TEXT    NOT NULL,
    Description    TEXT,
    CreatedBy      TEXT    NOT NULL,
    CreatedAt      TEXT    NOT NULL,
    IsActive       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS app_ReportAxis (
    AxisId         INTEGER PRIMARY KEY AUTOINCREMENT,
    ReportId       INTEGER NOT NULL REFERENCES app_ReportDefinition(ReportId),
    AxisType       TEXT    NOT NULL CHECK (AxisType IN ('ROW','COLUMN','FILTER')),
    DimensionName  TEXT    NOT NULL,
    HierarchyName  TEXT,
    SortOrder      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_ReportFilter (
    FilterId       INTEGER PRIMARY KEY AUTOINCREMENT,
    ReportId       INTEGER NOT NULL REFERENCES app_ReportDefinition(ReportId),
    DimensionName  TEXT    NOT NULL,
    MemberKeys     TEXT    NOT NULL  -- JSON array of selected keys
);

CREATE TABLE IF NOT EXISTS app_ReportMeasure (
    MeasureId      INTEGER PRIMARY KEY AUTOINCREMENT,
    ReportId       INTEGER NOT NULL REFERENCES app_ReportDefinition(ReportId),
    MeasureName    TEXT    NOT NULL,
    SortOrder      INTEGER NOT NULL DEFAULT 0
);
