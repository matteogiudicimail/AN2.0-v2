/**
 * rowApprovalService — persists row-level approval flags in cfg_RowApproval.
 *
 * A row is identified by a sorted-JSON snapshot of its dimension values
 * (same format used by the _WRITE_LOG DimensionsJson column).
 *
 * [V3] All SQL uses parameterised values.
 * [V4] No internals exposed to callers.
 * [V5] <150 lines.
 * [V6] Business logic here; route orchestrates.
 */

import { dbAll, dbGet, dbRun } from '../config/dbHelpers';

// ── Public types ──────────────────────────────────────────────────────────────

export interface RowApprovalDto {
  /** Sorted-JSON string of the row's dimension values. */
  dimensionsJson: string;
  /** true = approve; false = revoke approval. */
  approved: boolean;
}

export interface BulkRowApprovalDto {
  dimensionsJsonArray: string[];
  approved: boolean;
}

// ── getRowApprovals ───────────────────────────────────────────────────────────

/**
 * Returns a Set of approved DimensionsJson strings for the given report.
 * O(1) membership checks on the result set.
 */
export async function getRowApprovals(reportId: number): Promise<Set<string>> {
  const rows = await dbAll<{ DimensionsJson: string }>(
    `SELECT DimensionsJson
       FROM dbo.cfg_RowApproval
      WHERE ReportId = ? AND IsApproved = 1`,
    reportId,
  );
  return new Set(rows.map((r) => r.DimensionsJson));
}

/**
 * Returns all approved DimensionsJson strings as an array (for grid response).
 */
export async function getRowApprovalsArray(reportId: number): Promise<string[]> {
  const rows = await dbAll<{ DimensionsJson: string }>(
    `SELECT DimensionsJson
       FROM dbo.cfg_RowApproval
      WHERE ReportId = ? AND IsApproved = 1`,
    reportId,
  );
  return rows.map((r) => r.DimensionsJson);
}

// ── setRowApproval ────────────────────────────────────────────────────────────

/**
 * Upserts the approval status for a single row.
 * If approved=false, the record is deleted (keeps the table clean).
 */
export async function setRowApproval(
  reportId: number,
  dimensionsJson: string,
  approved: boolean,
  userId: string,
): Promise<void> {
  if (!approved) {
    await dbRun(
      `DELETE FROM dbo.cfg_RowApproval
        WHERE ReportId = ? AND DimensionsJson = ?`,
      reportId, dimensionsJson,
    );
    return;
  }

  const existing = await dbGet<{ ApprovalId: number }>(
    `SELECT ApprovalId FROM dbo.cfg_RowApproval
      WHERE ReportId = ? AND DimensionsJson = ?`,
    reportId, dimensionsJson,
  );

  if (existing) {
    await dbRun(
      `UPDATE dbo.cfg_RowApproval
          SET IsApproved = 1, ApprovedBy = ?, ApprovedAt = SYSUTCDATETIME()
        WHERE ApprovalId = ?`,
      userId, existing.ApprovalId,
    );
  } else {
    await dbRun(
      `INSERT INTO dbo.cfg_RowApproval (ReportId, DimensionsJson, IsApproved, ApprovedBy, ApprovedAt)
       VALUES (?, ?, 1, ?, SYSUTCDATETIME())`,
      reportId, dimensionsJson, userId,
    );
  }
}

// ── bulkSetRowApproval ────────────────────────────────────────────────────────

/**
 * Bulk-sets approval status for multiple rows (used for Aggregato parent cascades).
 * Runs each upsert sequentially to avoid transaction overhead.
 */
export async function bulkSetRowApproval(
  reportId: number,
  dimensionsJsonArray: string[],
  approved: boolean,
  userId: string,
): Promise<void> {
  for (const dj of dimensionsJsonArray) {
    await setRowApproval(reportId, dj, approved, userId);
  }
}
