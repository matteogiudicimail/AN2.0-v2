/**
 * Writeback Service — saves leaf and aggregate deltas.
 *
 * Rules:
 *  F05  Leaf delta: edit a leaf cell, store delta, subtract from base for display
 *  F06  Aggregate delta: create a synthetic child member, store delta there
 *  F10  Annotation mandatory for aggregate-level writes
 *  F11  Optimistic locking via Version field
 *  F12  Every write creates an immutable audit row in app_DeltaAudit
 *  F14  Caller must verify permissions BEFORE calling this service
 *  F15  Process must not be locked
 *
 * Converted from SQLite synchronous API to mssql async + withTransaction.
 */
import { dbGet, dbRun, withTransaction } from '../../config/dbHelpers';
import { dbGetTx, dbRunTx, dbInsertGetIdTx } from '../../config/dbHelpers';
import { WritebackRequest, WritebackResponse } from '../../models/writeback.models';
import { detectConflict } from './conflictDetector';
import { isProcessLocked } from './processLockService';

const WRITEBACK_ADJ_LEVEL_ID = -1;

interface ExistingDeltaRow {
  DeltaId:    number;
  DeltaValue: number;
  Version:    number;
}

interface SyntheticMemberRow {
  SyntheticKey: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function getBaseFactValue(
  rclAccountKey: string,
  loadId: number,
  entityId: number,
  currencyId: number,
): Promise<number> {
  // AmLocSign is pre-computed: AmountLocCurrency * (PLIs_SQL=1 ? -1 : 1)
  // This matches the display sign used in the report, so delta = newValue - base is correct.
  const factRow = await dbGet<{ BaseAmount: number }>(
    `SELECT SUM(f.AmLocSign) AS BaseAmount
     FROM vCFS_FactValue_Local_Cube f
     WHERE f.RclAccountKey = ? AND f.LoadId = ? AND f.EntityId = ?
       AND f.CurrencyId = ?`,
    rclAccountKey, loadId, entityId, currencyId
  );
  return factRow?.BaseAmount ?? 0;
}

async function getEffectiveValue(
  rclAccountKey: string,
  loadId: number,
  entityId: number,
  currencyId: number,
): Promise<number> {
  const base = await getBaseFactValue(rclAccountKey, loadId, entityId, currencyId);
  const deltaRow = await dbGet<{ DeltaSum: number }>(
    `SELECT SUM(DeltaValue) AS DeltaSum
     FROM app_Delta
     WHERE RclAccountKey = ? AND LoadId = ? AND EntityId = ?
       AND CurrencyId = ? AND IsActive = 1`,
    rclAccountKey, loadId, entityId, currencyId
  );
  return base + (deltaRow?.DeltaSum ?? 0);
}

async function insertDelta(
  req: WritebackRequest,
  rclAccountKey: string,
  adjLevelId: number,
  isSynthetic: number,
  userId: string,
  previousValue: number,
): Promise<{ deltaId: number; version: number }> {
  const now = nowIso();

  return withTransaction(async (tx) => {
    const existing = await dbGetTx<ExistingDeltaRow>(
      tx,
      `SELECT TOP 1 DeltaId, DeltaValue, Version FROM app_Delta
       WHERE RclAccountKey = ? AND LoadId = ? AND EntityId = ?
         AND CurrencyId = ? AND AdjLevelId = ? AND IsActive = 1
       ORDER BY DeltaId DESC`,
      rclAccountKey, req.loadId, req.entityId, req.currencyId, adjLevelId
    );

    const base = isSynthetic === 0
      ? await getBaseFactValue(rclAccountKey, req.loadId, req.entityId, req.currencyId)
      : 0;
    const deltaValue = req.newValue - base;

    if (existing) {
      await dbRunTx(tx,
        `UPDATE app_Delta SET IsActive = 0, UpdatedBy = ?, UpdatedAt = ? WHERE DeltaId = ?`,
        userId, now, existing.DeltaId
      );
    }

    const deltaId = await dbInsertGetIdTx(tx,
      `INSERT INTO app_Delta
         (LoadId, EntityId, RclAccountKey, AdjLevelId, DimAcc01Code, DimAcc02Code,
          Counterpart, CurrencyId, MeasureName, DeltaValue, IsSynthetic,
          Annotation, CreatedBy, CreatedAt, UpdatedBy, UpdatedAt, IsActive, Version)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1)`,
      req.loadId, req.entityId, rclAccountKey, adjLevelId,
      req.dimAcc01Code ?? null, req.dimAcc02Code ?? null,
      req.counterpart ?? null, req.currencyId,
      'AmountLocCurrency', deltaValue, isSynthetic,
      req.annotation ?? null, userId, now, userId, now
    );

    // Re-query effective within the transaction to be accurate
    const deltaRow = await dbGetTx<{ DeltaSum: number }>(tx,
      `SELECT SUM(DeltaValue) AS DeltaSum
       FROM app_Delta
       WHERE RclAccountKey = ? AND LoadId = ? AND EntityId = ?
         AND CurrencyId = ? AND IsActive = 1`,
      rclAccountKey, req.loadId, req.entityId, req.currencyId
    );
    const effectiveInTx = base + (deltaRow?.DeltaSum ?? 0);
    const delta = effectiveInTx - previousValue;

    await dbRunTx(tx,
      `INSERT INTO app_DeltaAudit
         (DeltaId, LoadId, EntityId, RclAccountKey, AdjLevelId, DimAcc01Code, DimAcc02Code,
          Counterpart, CurrencyId, MeasureName,
          PreviousEffectiveValue, NewEffectiveValue, DeltaAmount,
          ModificationType, Annotation, ModifiedBy, ModifiedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      deltaId, req.loadId, req.entityId, rclAccountKey, adjLevelId,
      req.dimAcc01Code ?? null, req.dimAcc02Code ?? null,
      req.counterpart ?? null, req.currencyId, 'AmountLocCurrency',
      previousValue, effectiveInTx, delta,
      existing ? 'UPDATE' : 'INSERT',
      req.annotation ?? null, userId, now
    );

    return { deltaId, version: 1 };
  });
}

async function ensureSyntheticMember(parentRclKey: string, userId: string): Promise<string> {
  const existing = await dbGet<SyntheticMemberRow>(
    'SELECT TOP 1 SyntheticKey FROM app_SyntheticRclMember WHERE ParentRclKey = ? AND CreatedBy = ?',
    parentRclKey, userId
  );
  if (existing) return existing.SyntheticKey;

  const syntheticKey = `SYN_${parentRclKey}_${Date.now()}`;
  const now = nowIso();
  await dbRun(
    `INSERT INTO app_SyntheticRclMember (SyntheticKey, ParentRclKey, Label, CreatedBy, CreatedAt)
     VALUES (?, ?, 'Manual Adjustment', ?, ?)`,
    syntheticKey, parentRclKey, userId, now
  );
  return syntheticKey;
}

export interface SaveDeltaResult {
  writebackResponse?: WritebackResponse;
  conflict?: import('../../models/writeback.models').ConflictInfo;
  processLocked?: boolean;
}

export async function saveLeafDelta(req: WritebackRequest, userId: string): Promise<SaveDeltaResult> {
  if (await isProcessLocked(req.loadId)) return { processLocked: true };

  const adjLevelId = req.adjLevelId ?? WRITEBACK_ADJ_LEVEL_ID;

  const conflict = await detectConflict(
    req.rclAccountKey, req.loadId, req.entityId, req.currencyId,
    adjLevelId, req.currentVersion, req.newValue,
  );
  if (conflict) return { conflict };

  const previousValue = await getEffectiveValue(
    req.rclAccountKey, req.loadId, req.entityId, req.currencyId);

  const { deltaId, version } = await insertDelta(
    req, req.rclAccountKey, adjLevelId, 0, userId, previousValue);

  const newEffective = await getEffectiveValue(
    req.rclAccountKey, req.loadId, req.entityId, req.currencyId);

  return { writebackResponse: { deltaId, newEffectiveValue: newEffective, newVersion: version } };
}

export async function saveAggregateDelta(req: WritebackRequest, userId: string): Promise<SaveDeltaResult> {
  if (!req.annotation || req.annotation.trim().length < 3) {
    throw Object.assign(
      new Error('Annotation is required for aggregate-level write-back (minimum 3 characters)'),
      { status: 400 },
    );
  }
  if (await isProcessLocked(req.loadId)) return { processLocked: true };
  if (!req.parentRclKey) {
    throw Object.assign(new Error('parentRclKey is required for aggregate write-back'), { status: 400 });
  }

  const syntheticKey = await ensureSyntheticMember(req.parentRclKey, userId);
  const adjLevelId = WRITEBACK_ADJ_LEVEL_ID;

  const previousValue = await getEffectiveValue(
    syntheticKey, req.loadId, req.entityId, req.currencyId);

  const modifiedReq: WritebackRequest = { ...req, rclAccountKey: syntheticKey };
  const { deltaId, version } = await insertDelta(
    modifiedReq, syntheticKey, adjLevelId, 1, userId, previousValue);

  const newEffective = await getEffectiveValue(
    syntheticKey, req.loadId, req.entityId, req.currencyId);

  return { writebackResponse: { deltaId, newEffectiveValue: newEffective, newVersion: version, syntheticKey } };
}

export async function revertDelta(deltaId: number, userId: string): Promise<void> {
  const now = nowIso();

  const delta = await dbGet<{
    DeltaId: number; LoadId: number; EntityId: number; RclAccountKey: string;
    AdjLevelId: number; DimAcc01Code: string|null; DimAcc02Code: string|null;
    Counterpart: string|null; CurrencyId: number; MeasureName: string;
    DeltaValue: number; IsActive: number;
  }>('SELECT TOP 1 * FROM app_Delta WHERE DeltaId = ?', deltaId);

  if (!delta || !delta.IsActive) {
    throw Object.assign(new Error('Delta not found or already reverted'), { status: 404 });
  }

  const previousValue = await getEffectiveValue(
    delta.RclAccountKey, delta.LoadId, delta.EntityId, delta.CurrencyId);

  await withTransaction(async (tx) => {
    await dbRunTx(tx,
      `UPDATE app_Delta SET IsActive=0, UpdatedBy=?, UpdatedAt=? WHERE DeltaId=?`,
      userId, now, deltaId
    );

    const newEffective = previousValue - delta.DeltaValue;

    await dbRunTx(tx,
      `INSERT INTO app_DeltaAudit
         (DeltaId, LoadId, EntityId, RclAccountKey, AdjLevelId, DimAcc01Code, DimAcc02Code,
          Counterpart, CurrencyId, MeasureName,
          PreviousEffectiveValue, NewEffectiveValue, DeltaAmount,
          ModificationType, Annotation, ModifiedBy, ModifiedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      deltaId, delta.LoadId, delta.EntityId, delta.RclAccountKey, delta.AdjLevelId,
      delta.DimAcc01Code, delta.DimAcc02Code, delta.Counterpart,
      delta.CurrencyId, delta.MeasureName,
      previousValue, newEffective, -delta.DeltaValue,
      'REVERT', null, userId, now
    );
  });
}
