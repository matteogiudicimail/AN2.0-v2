-- ============================================================
-- Default P&L report definition (seeded once)
-- ============================================================

INSERT OR IGNORE INTO app_ReportDefinition
    (ReportId, ReportName, Description, CreatedBy, CreatedAt, IsActive)
VALUES
    (1, 'P&L Report', 'Standard Profit & Loss — Reclassification on rows, Process on columns',
     'system', datetime('now'), 1);

-- Row axis: Reclassification hierarchy
INSERT OR IGNORE INTO app_ReportAxis (ReportId, AxisType, DimensionName, HierarchyName, SortOrder)
VALUES (1, 'ROW', 'Reclassification', 'Reclassification_h', 1);

-- Column axis: Process (period + scenario)
INSERT OR IGNORE INTO app_ReportAxis (ReportId, AxisType, DimensionName, HierarchyName, SortOrder)
VALUES (1, 'COLUMN', 'Process', 'Calendar', 1);

-- Filter axes
INSERT OR IGNORE INTO app_ReportAxis (ReportId, AxisType, DimensionName, HierarchyName, SortOrder)
VALUES (1, 'FILTER', 'Entity', NULL, 1);

INSERT OR IGNORE INTO app_ReportAxis (ReportId, AxisType, DimensionName, HierarchyName, SortOrder)
VALUES (1, 'FILTER', 'Scope', NULL, 2);

INSERT OR IGNORE INTO app_ReportAxis (ReportId, AxisType, DimensionName, HierarchyName, SortOrder)
VALUES (1, 'FILTER', 'Currency', NULL, 3);

-- Primary measure
INSERT OR IGNORE INTO app_ReportMeasure (ReportId, MeasureName, SortOrder)
VALUES (1, 'AmountLocCurrency', 1);

-- Seed a demo admin user permission (for local development only)
INSERT OR IGNORE INTO app_UserPermission (UserId, EntityId, Role, GrantedBy, GrantedAt)
VALUES ('dev-user', 100, 'Admin', 'system', datetime('now'));

INSERT OR IGNORE INTO app_UserPermission (UserId, EntityId, Role, GrantedBy, GrantedAt)
VALUES ('dev-user', 200, 'Admin', 'system', datetime('now'));

INSERT OR IGNORE INTO app_UserPermission (UserId, EntityId, Role, GrantedBy, GrantedAt)
VALUES ('dev-user', 300, 'Admin', 'system', datetime('now'));
