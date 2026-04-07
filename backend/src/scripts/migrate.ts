/**
 * Database migration — crea le tabelle app_* se non esistono.
 * Eseguire con: npx ts-node src/scripts/migrate.ts
 */
import { getPool, closePool } from '../config/db';

const DDL = `
-- ── app_Delta ────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE type='U' AND name='app_Delta')
CREATE TABLE app_Delta (
  DeltaId        INT IDENTITY(1,1) PRIMARY KEY,
  LoadId         INT           NOT NULL,
  EntityId       INT           NOT NULL,
  RclAccountKey  NVARCHAR(200) NOT NULL,
  AdjLevelId     INT           NOT NULL,
  DimAcc01Code   NVARCHAR(50)  NULL,
  DimAcc02Code   NVARCHAR(50)  NULL,
  Counterpart    NVARCHAR(50)  NULL,
  CurrencyId     INT           NOT NULL,
  MeasureName    NVARCHAR(50)  NOT NULL DEFAULT 'AmountLocCurrency',
  DeltaValue     DECIMAL(18,4) NOT NULL DEFAULT 0,
  IsSynthetic    BIT           NOT NULL DEFAULT 0,
  Annotation     NVARCHAR(500) NULL,
  CreatedBy      NVARCHAR(100) NOT NULL,
  CreatedAt      DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
  UpdatedBy      NVARCHAR(100) NOT NULL,
  UpdatedAt      DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
  IsActive       BIT           NOT NULL DEFAULT 1,
  Version        INT           NOT NULL DEFAULT 1
);

-- ── app_DeltaAudit ───────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE type='U' AND name='app_DeltaAudit')
CREATE TABLE app_DeltaAudit (
  AuditId                INT IDENTITY(1,1) PRIMARY KEY,
  DeltaId                INT           NOT NULL,
  LoadId                 INT           NOT NULL,
  EntityId               INT           NOT NULL,
  RclAccountKey          NVARCHAR(200) NOT NULL,
  AdjLevelId             INT           NOT NULL,
  DimAcc01Code           NVARCHAR(50)  NULL,
  DimAcc02Code           NVARCHAR(50)  NULL,
  Counterpart            NVARCHAR(50)  NULL,
  CurrencyId             INT           NOT NULL,
  MeasureName            NVARCHAR(50)  NOT NULL DEFAULT 'AmountLocCurrency',
  PreviousEffectiveValue DECIMAL(18,4) NOT NULL,
  NewEffectiveValue      DECIMAL(18,4) NOT NULL,
  DeltaAmount            DECIMAL(18,4) NOT NULL,
  ModificationType       NVARCHAR(20)  NOT NULL,
  Annotation             NVARCHAR(500) NULL,
  ModifiedBy             NVARCHAR(100) NOT NULL,
  ModifiedAt             DATETIME2     NOT NULL DEFAULT GETUTCDATE()
);

-- ── app_ProcessLock ──────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE type='U' AND name='app_ProcessLock')
CREATE TABLE app_ProcessLock (
  LoadId      INT           PRIMARY KEY,
  IsLocked    BIT           NOT NULL DEFAULT 0,
  LockedBy    NVARCHAR(100) NULL,
  LockedAt    DATETIME2     NULL,
  UnlockedBy  NVARCHAR(100) NULL,
  UnlockedAt  DATETIME2     NULL
);

-- ── app_SyntheticRclMember ──────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE type='U' AND name='app_SyntheticRclMember')
CREATE TABLE app_SyntheticRclMember (
  SyntheticKey  NVARCHAR(300) NOT NULL PRIMARY KEY,
  ParentRclKey  NVARCHAR(300) NOT NULL,
  Label         NVARCHAR(200) NOT NULL DEFAULT 'Manual Adjustment',
  CreatedBy     NVARCHAR(100) NOT NULL,
  CreatedAt     DATETIME2     NOT NULL DEFAULT GETUTCDATE()
);

-- ── app_UserPermission ───────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE type='U' AND name='app_UserPermission')
CREATE TABLE app_UserPermission (
  PermissionId INT IDENTITY(1,1) PRIMARY KEY,
  UserId       NVARCHAR(100) NOT NULL,
  EntityId     INT           NOT NULL,
  Role         NVARCHAR(20)  NOT NULL CHECK (Role IN ('Viewer','Editor','Approver','Admin')),
  GrantedBy    NVARCHAR(100) NULL,
  GrantedAt    DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT UQ_UserPermission UNIQUE (UserId, EntityId)
);
`;

async function main() {
  console.log('[migrate] Connecting to database...');
  const pool = await getPool();
  console.log('[migrate] Running DDL...');
  await pool.request().query(DDL);
  console.log('[migrate] Done. Tables created (if not existed).');
  await closePool();
}

main().catch(err => {
  console.error('[migrate] Error:', err.message);
  process.exit(1);
});
