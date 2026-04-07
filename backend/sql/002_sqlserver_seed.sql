-- ============================================================
-- CFS Demo Data — SQL Server version
-- Eseguire DOPO 001_sqlserver_schema.sql
-- Usa IF NOT EXISTS per idempotenza.
-- ============================================================

-- ── Entities ─────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Entity WHERE EntityId = 100)
  INSERT INTO dbo.tCFS_Entity (EntityId, EntityCode, Entity, ConsolidationGroupId, CountryCode)
  VALUES (100, 'HQ', 'Headquarters', 1, 'DE');

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Entity WHERE EntityId = 200)
  INSERT INTO dbo.tCFS_Entity (EntityId, EntityCode, Entity, ConsolidationGroupId, CountryCode)
  VALUES (200, 'SUB_A', 'Subsidiary Alpha', 1, 'IT');

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Entity WHERE EntityId = 300)
  INSERT INTO dbo.tCFS_Entity (EntityId, EntityCode, Entity, ConsolidationGroupId, CountryCode)
  VALUES (300, 'SUB_B', 'Subsidiary Beta', 1, 'FR');

-- ── Processes ─────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Process WHERE LoadId = 101)
  INSERT INTO dbo.tCFS_Process (LoadId, Process, Scenario, StartDate, EndDate, Year, Month, RefPrevious)
  VALUES (101, 'Actual Jan 2025', 'Actual', '2025-01-01', '2025-01-31', 2025, '2025-01', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Process WHERE LoadId = 102)
  INSERT INTO dbo.tCFS_Process (LoadId, Process, Scenario, StartDate, EndDate, Year, Month, RefPrevious)
  VALUES (102, 'Actual Feb 2025', 'Actual', '2025-02-01', '2025-02-28', 2025, '2025-02', 101);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Process WHERE LoadId = 103)
  INSERT INTO dbo.tCFS_Process (LoadId, Process, Scenario, StartDate, EndDate, Year, Month, RefPrevious)
  VALUES (103, 'Actual Mar 2025', 'Actual', '2025-03-01', '2025-03-31', 2025, '2025-03', 102);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Process WHERE LoadId = 201)
  INSERT INTO dbo.tCFS_Process (LoadId, Process, Scenario, StartDate, EndDate, Year, Month, RefPrevious)
  VALUES (201, 'Budget Jan 2025', 'Budget', '2025-01-01', '2025-01-31', 2025, '2025-01', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Process WHERE LoadId = 202)
  INSERT INTO dbo.tCFS_Process (LoadId, Process, Scenario, StartDate, EndDate, Year, Month, RefPrevious)
  VALUES (202, 'Budget Feb 2025', 'Budget', '2025-02-01', '2025-02-28', 2025, '2025-02', 201);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Process WHERE LoadId = 203)
  INSERT INTO dbo.tCFS_Process (LoadId, Process, Scenario, StartDate, EndDate, Year, Month, RefPrevious)
  VALUES (203, 'Budget Mar 2025', 'Budget', '2025-03-01', '2025-03-31', 2025, '2025-03', 202);

-- ── Currencies ────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Currency WHERE CurrencyId = 1)
  INSERT INTO dbo.tCFS_Currency (CurrencyId, CurrencyCode, Currency) VALUES (1, 'EUR', 'Euro');

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Currency WHERE CurrencyId = 2)
  INSERT INTO dbo.tCFS_Currency (CurrencyId, CurrencyCode, Currency) VALUES (2, 'USD', 'US Dollar');

-- ── Scopes ────────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ScopeOfConsolidation WHERE ScopeId = 1)
  INSERT INTO dbo.tCFS_ScopeOfConsolidation (ScopeId, ScopeCode, Scope) VALUES (1, 'IFRS', 'IFRS Group');

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ScopeOfConsolidation WHERE ScopeId = 2)
  INSERT INTO dbo.tCFS_ScopeOfConsolidation (ScopeId, ScopeCode, Scope) VALUES (2, 'LOCAL', 'Local GAAP');

-- ── AdjLevel Hierarchy ────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_AdjLevelHierarchy WHERE AdjLevelId = 1)
  INSERT INTO dbo.tCFS_AdjLevelHierarchy VALUES (1,'Base Data','BASE',1,'Reported','REPORTED',1,'Reported Data','RPT',1);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_AdjLevelHierarchy WHERE AdjLevelId = 2)
  INSERT INTO dbo.tCFS_AdjLevelHierarchy VALUES (2,'Rounding Adj.','ROUND',1,'Reported','REPORTED',1,'Reported Data','RPT',2);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_AdjLevelHierarchy WHERE AdjLevelId = 3)
  INSERT INTO dbo.tCFS_AdjLevelHierarchy VALUES (3,'IC Elimination','IC_ELIM',2,'IC Adj.','IC_ADJ',2,'Cons. Adj.','CONS',1);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_AdjLevelHierarchy WHERE AdjLevelId = 4)
  INSERT INTO dbo.tCFS_AdjLevelHierarchy VALUES (4,'Cons. Adjustment','CONS_ADJ',2,'IC Adj.','IC_ADJ',2,'Cons. Adj.','CONS',2);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_AdjLevelHierarchy WHERE AdjLevelId = -1)
  INSERT INTO dbo.tCFS_AdjLevelHierarchy VALUES (-1,'Manual Writeback','WB',9,'Writeback','WB',9,'Writeback','WB',1);

-- ── AdjLevel-Scope mapping ─────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Mapping_AdjLevel_ScopeId WHERE AdjLevelId=1 AND ScopeId=1)
  INSERT INTO dbo.tCFS_Mapping_AdjLevel_ScopeId VALUES (1,1);
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Mapping_AdjLevel_ScopeId WHERE AdjLevelId=2 AND ScopeId=1)
  INSERT INTO dbo.tCFS_Mapping_AdjLevel_ScopeId VALUES (2,1);
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Mapping_AdjLevel_ScopeId WHERE AdjLevelId=3 AND ScopeId=1)
  INSERT INTO dbo.tCFS_Mapping_AdjLevel_ScopeId VALUES (3,1);
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Mapping_AdjLevel_ScopeId WHERE AdjLevelId=4 AND ScopeId=1)
  INSERT INTO dbo.tCFS_Mapping_AdjLevel_ScopeId VALUES (4,1);
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Mapping_AdjLevel_ScopeId WHERE AdjLevelId=-1 AND ScopeId=1)
  INSERT INTO dbo.tCFS_Mapping_AdjLevel_ScopeId VALUES (-1,1);
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Mapping_AdjLevel_ScopeId WHERE AdjLevelId=1 AND ScopeId=2)
  INSERT INTO dbo.tCFS_Mapping_AdjLevel_ScopeId VALUES (1,2);
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Mapping_AdjLevel_ScopeId WHERE AdjLevelId=-1 AND ScopeId=2)
  INSERT INTO dbo.tCFS_Mapping_AdjLevel_ScopeId VALUES (-1,2);

-- ── Cost Centers ──────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_AccDim01 WHERE DimAcc01Code='CC_OPS')
  INSERT INTO dbo.tCFS_AccDim01 VALUES ('CC_OPS','CC_OPS','Operations','All CC','COO');
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_AccDim01 WHERE DimAcc01Code='CC_FIN')
  INSERT INTO dbo.tCFS_AccDim01 VALUES ('CC_FIN','CC_FIN','Finance','All CC','CFO');
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_AccDim01 WHERE DimAcc01Code='CC_CORP')
  INSERT INTO dbo.tCFS_AccDim01 VALUES ('CC_CORP','CC_CORP','Corporate','All CC','CEO');

-- ── DimAcc02 ──────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_DimAcc02 WHERE DimAcc02Code='CO_MKT')
  INSERT INTO dbo.tCFS_DimAcc02 VALUES ('CO_MKT','Marketing');
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_DimAcc02 WHERE DimAcc02Code='CO_IT')
  INSERT INTO dbo.tCFS_DimAcc02 VALUES ('CO_IT','IT & Systems');

-- ── SourceType (PLIs) ─────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Reclassification_SourceType WHERE PathItem01='RCL01')
  INSERT INTO dbo.tCFS_Reclassification_SourceType VALUES ('RCL01',0);
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Reclassification_SourceType WHERE PathItem01='RCL02')
  INSERT INTO dbo.tCFS_Reclassification_SourceType VALUES ('RCL02',1);
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Reclassification_SourceType WHERE PathItem01='RCL03')
  INSERT INTO dbo.tCFS_Reclassification_SourceType VALUES ('RCL03',1);
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Reclassification_SourceType WHERE PathItem01='RCL04')
  INSERT INTO dbo.tCFS_Reclassification_SourceType VALUES ('RCL04',0);
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_Reclassification_SourceType WHERE PathItem01='RCL05')
  INSERT INTO dbo.tCFS_Reclassification_SourceType VALUES ('RCL05',1);

-- ── Reclassification Hierarchy — L1 ──────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL01')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy
    (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,PathItem03,PathItem04,PathItem05,L_h01,L_h02,L_h03,L_h04,L_h05,IsLeaf)
  VALUES ('RCL01',NULL,'Revenue','REV',1,1,'RCL01',NULL,NULL,NULL,NULL,'Revenue',NULL,NULL,NULL,NULL,0);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL02')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy
    (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,PathItem03,PathItem04,PathItem05,L_h01,L_h02,L_h03,L_h04,L_h05,IsLeaf)
  VALUES ('RCL02',NULL,'Cost of Sales','COS',2,1,'RCL02',NULL,NULL,NULL,NULL,'Cost of Sales',NULL,NULL,NULL,NULL,0);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL03')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy
    (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,PathItem03,PathItem04,PathItem05,L_h01,L_h02,L_h03,L_h04,L_h05,IsLeaf)
  VALUES ('RCL03',NULL,'Operating Expenses','OPEX',3,1,'RCL03',NULL,NULL,NULL,NULL,'Operating Expenses',NULL,NULL,NULL,NULL,0);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL04')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy
    (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,PathItem03,PathItem04,PathItem05,L_h01,L_h02,L_h03,L_h04,L_h05,IsLeaf)
  VALUES ('RCL04',NULL,'Other Income/Exp.','OIE',4,1,'RCL04',NULL,NULL,NULL,NULL,'Other Income/Exp.',NULL,NULL,NULL,NULL,0);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL05')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy
    (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,PathItem03,PathItem04,PathItem05,L_h01,L_h02,L_h03,L_h04,L_h05,IsLeaf)
  VALUES ('RCL05',NULL,'Income Tax','TAX',5,1,'RCL05',NULL,NULL,NULL,NULL,'Income Tax',NULL,NULL,NULL,NULL,0);

-- L2
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL01_01')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,L_h01,L_h02,IsLeaf)
  VALUES ('RCL01_01','RCL01','Net Sales','NS',1,1,'RCL01','RCL01_01','Revenue','Net Sales',0);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL01_02')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,L_h01,L_h02,IsLeaf)
  VALUES ('RCL01_02','RCL01','Other Revenue','OREV',2,1,'RCL01','RCL01_02','Revenue','Other Revenue',1);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL02_01')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,L_h01,L_h02,IsLeaf)
  VALUES ('RCL02_01','RCL02','Direct Costs','DC',1,1,'RCL02','RCL02_01','Cost of Sales','Direct Costs',0);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL02_02')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,L_h01,L_h02,IsLeaf)
  VALUES ('RCL02_02','RCL02','Overhead','OVH',2,1,'RCL02','RCL02_02','Cost of Sales','Overhead',0);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL03_01')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,L_h01,L_h02,IsLeaf)
  VALUES ('RCL03_01','RCL03','SG&A','SGA',1,1,'RCL03','RCL03_01','Operating Expenses','SG&A',0);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL03_02')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,L_h01,L_h02,IsLeaf)
  VALUES ('RCL03_02','RCL03','R&D','RD',2,1,'RCL03','RCL03_02','Operating Expenses','R&D',1);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL04_01')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,L_h01,L_h02,IsLeaf)
  VALUES ('RCL04_01','RCL04','Interest Income','II',1,1,'RCL04','RCL04_01','Other Income/Exp.','Interest Income',1);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL04_02')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,L_h01,L_h02,IsLeaf)
  VALUES ('RCL04_02','RCL04','Interest Expense','IE',2,1,'RCL04','RCL04_02','Other Income/Exp.','Interest Expense',1);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL05_01')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,L_h01,L_h02,IsLeaf)
  VALUES ('RCL05_01','RCL05','Current Tax','CT',1,1,'RCL05','RCL05_01','Income Tax','Current Tax',1);

-- L3
IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL01_01_01')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,PathItem03,L_h01,L_h02,L_h03,IsLeaf)
  VALUES ('RCL01_01_01','RCL01_01','Product Sales','PS',1,1,'RCL01','RCL01_01','RCL01_01_01','Revenue','Net Sales','Product Sales',1);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL01_01_02')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,PathItem03,L_h01,L_h02,L_h03,IsLeaf)
  VALUES ('RCL01_01_02','RCL01_01','Service Sales','SS',2,1,'RCL01','RCL01_01','RCL01_01_02','Revenue','Net Sales','Service Sales',1);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL02_01_01')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,PathItem03,L_h01,L_h02,L_h03,IsLeaf)
  VALUES ('RCL02_01_01','RCL02_01','Raw Materials','RM',1,1,'RCL02','RCL02_01','RCL02_01_01','Cost of Sales','Direct Costs','Raw Materials',1);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL02_01_02')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,PathItem03,L_h01,L_h02,L_h03,IsLeaf)
  VALUES ('RCL02_01_02','RCL02_01','Direct Labor','DL',2,1,'RCL02','RCL02_01','RCL02_01_02','Cost of Sales','Direct Costs','Direct Labor',1);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL02_02_01')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,PathItem03,L_h01,L_h02,L_h03,IsLeaf)
  VALUES ('RCL02_02_01','RCL02_02','Depreciation','DEP',1,1,'RCL02','RCL02_02','RCL02_02_01','Cost of Sales','Overhead','Depreciation',1);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL02_02_02')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,PathItem03,L_h01,L_h02,L_h03,IsLeaf)
  VALUES ('RCL02_02_02','RCL02_02','Other Overhead','OOH',2,1,'RCL02','RCL02_02','RCL02_02_02','Cost of Sales','Overhead','Other Overhead',1);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL03_01_01')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,PathItem03,L_h01,L_h02,L_h03,IsLeaf)
  VALUES ('RCL03_01_01','RCL03_01','Sales Expenses','SE',1,1,'RCL03','RCL03_01','RCL03_01_01','Operating Expenses','SG&A','Sales Expenses',1);

IF NOT EXISTS (SELECT 1 FROM dbo.tCFS_ReclassificationHierarchy WHERE FolderChildKey='RCL03_01_02')
  INSERT INTO dbo.tCFS_ReclassificationHierarchy (FolderChildKey,FolderFatherKey,Folder,FolderCode,InLevelOrder,HierarchyMasterLevel,PathItem01,PathItem02,PathItem03,L_h01,L_h02,L_h03,IsLeaf)
  VALUES ('RCL03_01_02','RCL03_01','Admin Expenses','AE',2,1,'RCL03','RCL03_01','RCL03_01_02','Operating Expenses','SG&A','Admin Expenses',1);

-- ── Process Locks (default unlocked) ─────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.app_ProcessLock WHERE LoadId=101)
  INSERT INTO dbo.app_ProcessLock (LoadId, IsLocked) VALUES (101,0);
IF NOT EXISTS (SELECT 1 FROM dbo.app_ProcessLock WHERE LoadId=102)
  INSERT INTO dbo.app_ProcessLock (LoadId, IsLocked) VALUES (102,0);
IF NOT EXISTS (SELECT 1 FROM dbo.app_ProcessLock WHERE LoadId=103)
  INSERT INTO dbo.app_ProcessLock (LoadId, IsLocked) VALUES (103,0);
IF NOT EXISTS (SELECT 1 FROM dbo.app_ProcessLock WHERE LoadId=201)
  INSERT INTO dbo.app_ProcessLock (LoadId, IsLocked) VALUES (201,0);
IF NOT EXISTS (SELECT 1 FROM dbo.app_ProcessLock WHERE LoadId=202)
  INSERT INTO dbo.app_ProcessLock (LoadId, IsLocked) VALUES (202,0);
IF NOT EXISTS (SELECT 1 FROM dbo.app_ProcessLock WHERE LoadId=203)
  INSERT INTO dbo.app_ProcessLock (LoadId, IsLocked) VALUES (203,0);

-- ── Dev user permissions ───────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.app_UserPermission WHERE UserId='dev-user' AND EntityId=100)
  INSERT INTO dbo.app_UserPermission (UserId, EntityId, Role, GrantedBy, GrantedAt)
  VALUES ('dev-user', 100, 'Admin', 'system', GETUTCDATE());

IF NOT EXISTS (SELECT 1 FROM dbo.app_UserPermission WHERE UserId='dev-user' AND EntityId=200)
  INSERT INTO dbo.app_UserPermission (UserId, EntityId, Role, GrantedBy, GrantedAt)
  VALUES ('dev-user', 200, 'Admin', 'system', GETUTCDATE());

IF NOT EXISTS (SELECT 1 FROM dbo.app_UserPermission WHERE UserId='dev-user' AND EntityId=300)
  INSERT INTO dbo.app_UserPermission (UserId, EntityId, Role, GrantedBy, GrantedAt)
  VALUES ('dev-user', 300, 'Admin', 'system', GETUTCDATE());
