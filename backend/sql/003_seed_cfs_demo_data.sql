-- ============================================================
-- CFS Demo Data — Dimension tables
-- Fact data is generated programmatically in seed.ts
-- ============================================================

-- ── Entities ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tCFS_Entity (
    EntityId               INTEGER PRIMARY KEY,
    EntityCode             TEXT    NOT NULL UNIQUE,
    Entity                 TEXT    NOT NULL,
    ConsolidationGroupId   INTEGER,
    CountryCode            TEXT
);

INSERT OR IGNORE INTO tCFS_Entity VALUES (100, 'HQ',    'Headquarters',    1, 'DE');
INSERT OR IGNORE INTO tCFS_Entity VALUES (200, 'SUB_A', 'Subsidiary Alpha', 1, 'IT');
INSERT OR IGNORE INTO tCFS_Entity VALUES (300, 'SUB_B', 'Subsidiary Beta',  1, 'FR');

-- ── Processes (Period + Scenario) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tCFS_Process (
    LoadId        INTEGER PRIMARY KEY,
    Process       TEXT    NOT NULL,
    Scenario      TEXT    NOT NULL,
    StartDate     TEXT    NOT NULL,
    EndDate       TEXT    NOT NULL,
    Year          INTEGER NOT NULL,
    Month         TEXT    NOT NULL,   -- 'YYYY-MM'
    RefPrevious   INTEGER             -- LoadId of previous process (for variance)
);

INSERT OR IGNORE INTO tCFS_Process VALUES (101,'Actual Jan 2025','Actual','2025-01-01','2025-01-31',2025,'2025-01',NULL);
INSERT OR IGNORE INTO tCFS_Process VALUES (102,'Actual Feb 2025','Actual','2025-02-01','2025-02-28',2025,'2025-02',101);
INSERT OR IGNORE INTO tCFS_Process VALUES (103,'Actual Mar 2025','Actual','2025-03-01','2025-03-31',2025,'2025-03',102);
INSERT OR IGNORE INTO tCFS_Process VALUES (201,'Budget Jan 2025','Budget','2025-01-01','2025-01-31',2025,'2025-01',NULL);
INSERT OR IGNORE INTO tCFS_Process VALUES (202,'Budget Feb 2025','Budget','2025-02-01','2025-02-28',2025,'2025-02',201);
INSERT OR IGNORE INTO tCFS_Process VALUES (203,'Budget Mar 2025','Budget','2025-03-01','2025-03-31',2025,'2025-03',202);

-- ── Currencies ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tCFS_Currency (
    CurrencyId   INTEGER PRIMARY KEY,
    CurrencyCode TEXT    NOT NULL UNIQUE,
    Currency     TEXT    NOT NULL
);

INSERT OR IGNORE INTO tCFS_Currency VALUES (1,'EUR','Euro');
INSERT OR IGNORE INTO tCFS_Currency VALUES (2,'USD','US Dollar');

-- ── Scope of Consolidation ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tCFS_ScopeOfConsolidation (
    ScopeId    INTEGER PRIMARY KEY,
    ScopeCode  TEXT    NOT NULL UNIQUE,
    Scope      TEXT    NOT NULL
);

INSERT OR IGNORE INTO tCFS_ScopeOfConsolidation VALUES (1,'IFRS','IFRS Group');
INSERT OR IGNORE INTO tCFS_ScopeOfConsolidation VALUES (2,'LOCAL','Local GAAP');

-- ── Adjustment Level Hierarchy (3 levels: Group > Type > Level) ──────────────
CREATE TABLE IF NOT EXISTS tCFS_AdjLevelHierarchy (
    AdjLevelId        INTEGER PRIMARY KEY,
    AdjLevel          TEXT    NOT NULL,
    AdjLevelCode      TEXT    NOT NULL,
    AdjGroupTypeId    INTEGER NOT NULL,
    AdjGroupType      TEXT    NOT NULL,
    AdjGroupTypeCode  TEXT    NOT NULL,
    AdjGroupId        INTEGER NOT NULL,
    AdjGroup          TEXT    NOT NULL,
    AdjGroupCode      TEXT    NOT NULL,
    InLevelOrder      INTEGER NOT NULL DEFAULT 1
);

-- Group 1: Reported Data
INSERT OR IGNORE INTO tCFS_AdjLevelHierarchy
    VALUES (1,'Base Data',       'BASE',    1,'Reported','REPORTED',1,'Reported Data','RPT',1);
INSERT OR IGNORE INTO tCFS_AdjLevelHierarchy
    VALUES (2,'Rounding Adj.',   'ROUND',   1,'Reported','REPORTED',1,'Reported Data','RPT',2);
-- Group 2: Consolidation Adjustments
INSERT OR IGNORE INTO tCFS_AdjLevelHierarchy
    VALUES (3,'IC Elimination',  'IC_ELIM', 2,'IC Adj.', 'IC_ADJ',  2,'Cons. Adj.','CONS',1);
INSERT OR IGNORE INTO tCFS_AdjLevelHierarchy
    VALUES (4,'Cons. Adjustment','CONS_ADJ',2,'IC Adj.', 'IC_ADJ',  2,'Cons. Adj.','CONS',2);
-- Special: Manual Writeback (reserved for synthetic deltas)
INSERT OR IGNORE INTO tCFS_AdjLevelHierarchy
    VALUES (-1,'Manual Writeback','WB',     9,'Writeback','WB',      9,'Writeback','WB',1);

-- ── Scope ↔ AdjLevel bridge (M:N) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tCFS_Mapping_AdjLevel_ScopeId (
    AdjLevelId  INTEGER NOT NULL,
    ScopeId     INTEGER NOT NULL,
    PRIMARY KEY (AdjLevelId, ScopeId)
);

-- IFRS scope sees all adjustment levels
INSERT OR IGNORE INTO tCFS_Mapping_AdjLevel_ScopeId VALUES (1,1);
INSERT OR IGNORE INTO tCFS_Mapping_AdjLevel_ScopeId VALUES (2,1);
INSERT OR IGNORE INTO tCFS_Mapping_AdjLevel_ScopeId VALUES (3,1);
INSERT OR IGNORE INTO tCFS_Mapping_AdjLevel_ScopeId VALUES (4,1);
INSERT OR IGNORE INTO tCFS_Mapping_AdjLevel_ScopeId VALUES (-1,1);
-- Local GAAP sees only base data
INSERT OR IGNORE INTO tCFS_Mapping_AdjLevel_ScopeId VALUES (1,2);
INSERT OR IGNORE INTO tCFS_Mapping_AdjLevel_ScopeId VALUES (-1,2);

-- ── Cost Centers (DimAcc01) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tCFS_AccDim01 (
    DimAcc01Code         TEXT    PRIMARY KEY,
    CostCenterCode       TEXT    NOT NULL,
    CostCenter           TEXT    NOT NULL,
    CostCenterAggr       TEXT,
    Responsible          TEXT
);

INSERT OR IGNORE INTO tCFS_AccDim01 VALUES ('CC_OPS','CC_OPS','Operations','All CC','COO');
INSERT OR IGNORE INTO tCFS_AccDim01 VALUES ('CC_FIN','CC_FIN','Finance',    'All CC','CFO');
INSERT OR IGNORE INTO tCFS_AccDim01 VALUES ('CC_CORP','CC_CORP','Corporate', 'All CC','CEO');

-- ── Controlling Objects (DimAcc02) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tCFS_DimAcc02 (
    DimAcc02Code  TEXT    PRIMARY KEY,
    CO            TEXT    NOT NULL
);

INSERT OR IGNORE INTO tCFS_DimAcc02 VALUES ('CO_MKT','Marketing');
INSERT OR IGNORE INTO tCFS_DimAcc02 VALUES ('CO_IT', 'IT & Systems');

-- ── Reclassification SourceType — PLIs sign flag ─────────────────────────────
-- PLIs=1: amounts stored positive in fact, displayed NEGATED in P&L (costs)
-- PLIs=0: no inversion (revenue, other income)
CREATE TABLE IF NOT EXISTS tCFS_Reclassification_SourceType (
    PathItem01   TEXT    PRIMARY KEY,
    PLIs         INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO tCFS_Reclassification_SourceType VALUES ('RCL01', 0);  -- Revenue
INSERT OR IGNORE INTO tCFS_Reclassification_SourceType VALUES ('RCL02', 1);  -- Cost of Sales
INSERT OR IGNORE INTO tCFS_Reclassification_SourceType VALUES ('RCL03', 1);  -- Operating Expenses
INSERT OR IGNORE INTO tCFS_Reclassification_SourceType VALUES ('RCL04', 0);  -- Other Inc/Exp
INSERT OR IGNORE INTO tCFS_Reclassification_SourceType VALUES ('RCL05', 1);  -- Income Tax

-- ── Reclassification Hierarchy ────────────────────────────────────────────────
-- Flattened parent-child P&L structure (max 3 levels in this demo → ragged branches)
-- PathItem01-05 = ancestor keys at each level; L_h01-05 = ancestor labels
CREATE TABLE IF NOT EXISTS tCFS_ReclassificationHierarchy (
    FolderChildKey       TEXT    PRIMARY KEY,
    FolderFatherKey      TEXT,
    Folder               TEXT    NOT NULL,
    FolderCode           TEXT    NOT NULL,
    InLevelOrder         INTEGER NOT NULL DEFAULT 1,
    HierarchyMasterLevel INTEGER NOT NULL DEFAULT 1,
    PathItem01           TEXT,
    PathItem02           TEXT,
    PathItem03           TEXT,
    PathItem04           TEXT,
    PathItem05           TEXT,
    L_h01                TEXT,
    L_h02                TEXT,
    L_h03                TEXT,
    L_h04                TEXT,
    L_h05                TEXT,
    IsLeaf               INTEGER NOT NULL DEFAULT 0
);

-- ── L1 roots ─────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO tCFS_ReclassificationHierarchy
    (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,
     PathItem01,PathItem02,PathItem03,PathItem04,PathItem05,
     L_h01,L_h02,L_h03,L_h04,L_h05,IsLeaf)
VALUES
    ('RCL01',NULL,'Revenue',             'REV', 1,1,'RCL01',NULL,NULL,NULL,NULL,'Revenue',             NULL,NULL,NULL,NULL,0),
    ('RCL02',NULL,'Cost of Sales',       'COS', 2,1,'RCL02',NULL,NULL,NULL,NULL,'Cost of Sales',       NULL,NULL,NULL,NULL,0),
    ('RCL03',NULL,'Operating Expenses',  'OPEX',3,1,'RCL03',NULL,NULL,NULL,NULL,'Operating Expenses',  NULL,NULL,NULL,NULL,0),
    ('RCL04',NULL,'Other Income/Exp.',   'OIE', 4,1,'RCL04',NULL,NULL,NULL,NULL,'Other Income/Exp.',   NULL,NULL,NULL,NULL,0),
    ('RCL05',NULL,'Income Tax',          'TAX', 5,1,'RCL05',NULL,NULL,NULL,NULL,'Income Tax',          NULL,NULL,NULL,NULL,0);

-- ── L2 nodes ─────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO tCFS_ReclassificationHierarchy
    (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,
     PathItem01,PathItem02,PathItem03,PathItem04,PathItem05,
     L_h01,L_h02,L_h03,L_h04,L_h05,IsLeaf)
VALUES
    -- Revenue children
    ('RCL01_01','RCL01','Net Sales',      'NS',   1,1,'RCL01','RCL01_01',NULL,NULL,NULL,'Revenue','Net Sales',NULL,NULL,NULL,0),
    ('RCL01_02','RCL01','Other Revenue',  'OREV', 2,1,'RCL01','RCL01_02',NULL,NULL,NULL,'Revenue','Other Revenue',NULL,NULL,NULL,1),  -- RAGGED LEAF
    -- Cost of Sales children
    ('RCL02_01','RCL02','Direct Costs',   'DC',   1,1,'RCL02','RCL02_01',NULL,NULL,NULL,'Cost of Sales','Direct Costs',NULL,NULL,NULL,0),
    ('RCL02_02','RCL02','Overhead',       'OVH',  2,1,'RCL02','RCL02_02',NULL,NULL,NULL,'Cost of Sales','Overhead',NULL,NULL,NULL,0),
    -- OpEx children
    ('RCL03_01','RCL03','SG&A',           'SGA',  1,1,'RCL03','RCL03_01',NULL,NULL,NULL,'Operating Expenses','SG&A',NULL,NULL,NULL,0),
    ('RCL03_02','RCL03','R&D',            'RD',   2,1,'RCL03','RCL03_02',NULL,NULL,NULL,'Operating Expenses','R&D',NULL,NULL,NULL,1),  -- RAGGED LEAF
    -- Other Inc/Exp children (all leaves at L2 — ragged)
    ('RCL04_01','RCL04','Interest Income','II',   1,1,'RCL04','RCL04_01',NULL,NULL,NULL,'Other Income/Exp.','Interest Income',NULL,NULL,NULL,1),
    ('RCL04_02','RCL04','Interest Expense','IE',  2,1,'RCL04','RCL04_02',NULL,NULL,NULL,'Other Income/Exp.','Interest Expense',NULL,NULL,NULL,1),
    -- Tax children (leaf at L2 — ragged)
    ('RCL05_01','RCL05','Current Tax',    'CT',   1,1,'RCL05','RCL05_01',NULL,NULL,NULL,'Income Tax','Current Tax',NULL,NULL,NULL,1);

-- ── L3 leaf nodes ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO tCFS_ReclassificationHierarchy
    (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,
     PathItem01,PathItem02,PathItem03,PathItem04,PathItem05,
     L_h01,L_h02,L_h03,L_h04,L_h05,IsLeaf)
VALUES
    -- Net Sales leaves
    ('RCL01_01_01','RCL01_01','Product Sales', 'PS', 1,1,'RCL01','RCL01_01','RCL01_01_01',NULL,NULL,'Revenue','Net Sales','Product Sales',NULL,NULL,1),
    ('RCL01_01_02','RCL01_01','Service Sales', 'SS', 2,1,'RCL01','RCL01_01','RCL01_01_02',NULL,NULL,'Revenue','Net Sales','Service Sales',NULL,NULL,1),
    -- Direct Costs leaves
    ('RCL02_01_01','RCL02_01','Raw Materials', 'RM', 1,1,'RCL02','RCL02_01','RCL02_01_01',NULL,NULL,'Cost of Sales','Direct Costs','Raw Materials',NULL,NULL,1),
    ('RCL02_01_02','RCL02_01','Direct Labor',  'DL', 2,1,'RCL02','RCL02_01','RCL02_01_02',NULL,NULL,'Cost of Sales','Direct Costs','Direct Labor',NULL,NULL,1),
    -- Overhead leaves
    ('RCL02_02_01','RCL02_02','Depreciation',  'DEP',1,1,'RCL02','RCL02_02','RCL02_02_01',NULL,NULL,'Cost of Sales','Overhead','Depreciation',NULL,NULL,1),
    ('RCL02_02_02','RCL02_02','Other Overhead','OOH',2,1,'RCL02','RCL02_02','RCL02_02_02',NULL,NULL,'Cost of Sales','Overhead','Other Overhead',NULL,NULL,1),
    -- SG&A leaves
    ('RCL03_01_01','RCL03_01','Sales Expenses','SE', 1,1,'RCL03','RCL03_01','RCL03_01_01',NULL,NULL,'Operating Expenses','SG&A','Sales Expenses',NULL,NULL,1),
    ('RCL03_01_02','RCL03_01','Admin Expenses','AE', 2,1,'RCL03','RCL03_01','RCL03_01_02',NULL,NULL,'Operating Expenses','SG&A','Admin Expenses',NULL,NULL,1);

-- ── Fact table structure (data populated by seed.ts) ─────────────────────────
CREATE TABLE IF NOT EXISTS tCFS_FactValue_Local_Cube (
    FactId              INTEGER PRIMARY KEY AUTOINCREMENT,
    LoadId              INTEGER NOT NULL,
    EntityId            INTEGER NOT NULL,
    DimAcc01Code        TEXT,
    DimAcc02Code        TEXT,
    CurrencyId          INTEGER NOT NULL DEFAULT 1,
    RclAccountKey       TEXT    NOT NULL,  -- references leaf FolderChildKey
    AdjLevlId           INTEGER NOT NULL,
    Counterpart         TEXT,
    AmountLocCurrency   REAL    NOT NULL DEFAULT 0,
    AmountDocCurrency   REAL    NOT NULL DEFAULT 0,
    ExchangeRate        REAL    NOT NULL DEFAULT 1,
    DocNo               TEXT,
    MappingKey          TEXT
);

CREATE INDEX IF NOT EXISTS idx_Fact_main
    ON tCFS_FactValue_Local_Cube (LoadId, EntityId, RclAccountKey, AdjLevlId, CurrencyId);
