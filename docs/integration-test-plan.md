# CFS Reporting Plugin — Integration Test Plan

**Version:** 1.0
**Date:** 2026-03-26
**Stack:** Angular 16 + Node.js/Express + SQLite (POC) → SQL Server (production)

---

## Overview

This document covers end-to-end tests for all 17 MVP requirements (F01–F17).
Tests assume the system is started with `scripts/start-local.ps1` and seed data is loaded.

**Base URL:** `http://localhost:3000/api`
**Test token:** Generated via `node -e "const { createDevToken } = require('./dist/middleware/authJwt'); console.log(createDevToken('dev-user'));"` in the `backend/` directory.

---

## Environment Setup

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm start`
3. Verify health: `GET http://localhost:3000/api/health` → `{"status":"ok","db":"reachable"}`
4. Open browser: `http://localhost:4200`
5. Seed data: loaded automatically on first start (234 fact rows, 22 hierarchy nodes, 3 entities)

---

## Test Cases

### F01 — P&L Report Loading

**Objective:** Report loads with correct P&L hierarchy structure.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST `/api/report/query` with `entityIds:[100], scopeId:1, currencyId:1, loadIds:[101]` | 200 OK, `rows.length === 22`, `processColumns.length === 1` |
| 2 | Check row `Revenue` | `values['101']` is a positive number |
| 3 | Check row `Cost of Sales` | `values['101']` is a negative number |
| 4 | In browser: select Entity=HQ, Scope=IFRS, Currency=EUR, Process=Actual Jan 2025, Apply | Grid renders P&L hierarchy |

**Pass criteria:** 22 rows, Revenue positive, Costs negative.

---

### F02 — Expand/Collapse Hierarchy

**Objective:** Hierarchical tree can be expanded and collapsed.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load report as in F01 | Grid shows top-level rows (Revenue, Cost of Sales, etc.) |
| 2 | Check `dataPath` field on leaf `Product Sales` | `["RCL01", "RCL01_01", "RCL01_01_01"]` (length = 3) |
| 3 | In browser: click expand arrow on `Revenue` | Shows Net Sales, Other Revenue as children |
| 4 | Click collapse | Children hidden |

**Pass criteria:** `dataPath` length > 1 for non-root nodes; AG Grid expand/collapse works.

---

### F03 — Filter by Entity / Scope / Currency

**Objective:** Filters restrict the data shown.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST query with `entityIds:[100]` | Revenue = 2,802,500 |
| 2 | POST query with `entityIds:[200]` | Revenue = different value |
| 3 | POST query with `entityIds:[100,200]` | Revenue = sum of E100 + E200 |
| 4 | POST query with `scopeId:2` (LOCAL GAAP) | Results filtered by that scope's adj levels |
| 5 | POST query with `currencyId:2` (USD) | Values in USD |

**Pass criteria:** Different filters produce different totals; no cross-contamination.

---

### F04 — Processes as Columns

**Objective:** Each selected process appears as a separate column.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST query with `loadIds:[101,102,103]` | `processColumns.length === 3` |
| 2 | Check Revenue row | Has values for keys `'101'`, `'102'`, `'103'` |
| 3 | In browser: select 3 processes | Grid shows 3 value columns |

**Pass criteria:** N selected processes → N columns in grid.

---

### F05 — Leaf Cell Edit (Writeback)

**Objective:** Editing a leaf cell persists and updates aggregates.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load report, note `Product Sales` = 1,900,000 | Baseline established |
| 2 | POST `/api/writeback/save` with `rclAccountKey:"RCL01_01_01", newValue:2000000, annotation:"Test"` | 201 Created, `deltaId` returned |
| 3 | Reload report | `Product Sales` = 2,000,000 |
| 4 | Verify `Net Sales` updated | Was 2,660,000 → now 2,760,000 (+100,000) |
| 5 | Verify `Revenue` updated | Was 2,802,500 → now 2,902,500 (+100,000) |

**Pass criteria:** Changed cell reflects new value; all parent aggregates roll up correctly.

---

### F06 — Aggregate-Level Writeback (Synthetic Child)

**Objective:** Editing an aggregate node creates a synthetic child member.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load report, note `Cost of Sales` = -1,330,000 | Baseline |
| 2 | POST `/api/writeback/save` with `rclAccountKey:"RCL02", newValue:-50000, annotation:"Q1 true-up", parentRclKey:"RCL02"` | 201 Created, `syntheticKey` in response |
| 3 | Reload report | `Cost of Sales` = -1,380,000 (-1,330,000 + -50,000 adjustment) |
| 4 | Check for synthetic row | Row with `isSynthetic:true, parentRclKey:"RCL02", value:-50000` |

**Pass criteria:** Aggregate total changes by the adjustment amount; synthetic child created.

---

### F07 — Synthetic Rows Visible in Grid

**Objective:** Synthetic child rows appear in the P&L tree and are visually distinct.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | After F06, reload report | Synthetic row present (`isSynthetic:true`) |
| 2 | Check synthetic row properties | `isLeaf:true`, `label:"Manual Adjustment"`, value = adjustment amount |
| 3 | In browser: expand `Cost of Sales` | Synthetic row shown in italic/different style |

**Pass criteria:** `isSynthetic` flag set; row appears as leaf child of the aggregate.

---

### F08 — Sign Inversion (PLIs)

**Objective:** Revenue is positive, costs negative in the P&L display.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load baseline report | Revenue > 0, Cost of Sales < 0 |
| 2 | Check all cost rows | `Raw Materials < 0`, `Direct Labor < 0`, `Depreciation < 0` |
| 3 | Check income rows | `Interest Income > 0` (or check if PLIs flag applies) |
| 4 | In browser | Negative values shown in red |

**Pass criteria:** PLIs=1 nodes multiplied by -1; display matches expected P&L convention.

---

### F09 — Ragged Row Suppression

**Objective:** Rows with no values across all processes are hidden.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load report with data | No row with `values` all null |
| 2 | Load report with non-existent entity | 0 rows returned (not empty aggregate nodes) |

**Pass criteria:** `rows.filter(r => Object.values(r.values).every(v => v === null)).length === 0`

---

### F10 — Annotation Mandatory for Aggregate Writes

**Objective:** Aggregate-level edits without annotation are rejected.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST `/api/writeback/save` with `parentRclKey` and `annotation:""` | 400 Bad Request |
| 2 | POST with `annotation:"ab"` (< 3 chars) | 400 Bad Request |
| 3 | POST with `annotation:"Valid annotation"` | 201 Created |
| 4 | In browser: aggregate edit → annotation dialog required | Dialog enforces `minLength:3` |

**Pass criteria:** Empty/short annotations rejected with 400 for aggregate saves.

---

### F11 — Concurrent Edit Conflict Detection

**Objective:** Stale version check detects concurrent edits.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save a delta for a cell (creates Version=1) | 201 Created |
| 2 | POST save with same cell but `currentVersion:0` (stale) | 409 Conflict |
| 3 | Check 409 body | Contains `conflict.yourValue`, `conflict.serverValue`, `conflict.modifiedBy` |
| 4 | In browser: open same cell in two tabs, edit both | Second save shows conflict dialog |
| 5 | Choose "Retry" | Report reloads with fresh data |

**Pass criteria:** Stale version → 409 with `conflict` object; conflict dialog shown.

---

### F12 — Audit Trail (app_DeltaAudit)

**Objective:** Every save/revert creates an immutable audit record.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Make several edits on same cell | Each creates `app_DeltaAudit` row |
| 2 | Check `app_DeltaAudit` table directly | `PreviousEffectiveValue`, `NewEffectiveValue`, `DeltaAmount`, `ModifiedBy`, `ModifiedAt` populated |
| 3 | Revert a delta via POST `/api/writeback/revert` | Audit row with `ModificationType='REVERT'` |

**Pass criteria:** Audit table has 1 row per save; RevertDelta creates REVERT audit row.

---

### F13 — Cell History Dialog

**Objective:** Right-click context menu shows modification history.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST `/api/audit/cell-history` with `coordinates.rclAccountKey`, `loadId`, `entityId`, `currencyId` | 200, array of AuditEntry |
| 2 | Check entry fields | `modifiedBy`, `previousEffectiveValue`, `newEffectiveValue`, `deltaAmount`, `annotation`, `modifiedAt`, `modificationType` |
| 3 | In browser: right-click modified cell → "Cell history" | Dialog shows chronological list |

**Pass criteria:** API returns entries in descending date order; all fields populated.

---

### F14 — Row-Level Entity Permissions

**Objective:** Users can only write to entities they have Editor/Approver/Admin role on.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | GET `/api/permissions/me` | Returns user's entity permissions |
| 2 | POST save for `entityId` not in user's permissions | 403 Forbidden |
| 3 | POST save for `entityId` with `Role:'Viewer'` | 403 Forbidden |
| 4 | POST save for `entityId` with `Role:'Editor'` | 201 Created |
| 5 | GET `/api/dimensions/entities` | Returns only entities user has permissions on |

**Pass criteria:** `canWrite` gate enforced on all writeback endpoints.

---

### F15 — Process Lock (Read-only Mode)

**Objective:** Locked processes cannot be edited.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST `/api/writeback/process-lock/101` (Admin only) | 200, `isLocked:true` |
| 2 | POST writeback save for loadId=101 | 409, `processLocked:true` |
| 3 | DELETE `/api/writeback/process-lock/101` | 200, `isLocked:false` |
| 4 | POST writeback save again | 201 Created |
| 5 | Non-admin user tries to lock | 403 Forbidden |
| 6 | In browser: locked column shows lock icon, cells not editable | Edit cursor absent |

**Pass criteria:** Locked process rejects saves with 409 processLocked.

---

### F16 — Adj-Level Filter (Include/Exclude Manual Writeback)

**Objective:** Toggle controls whether manual write-back deltas are included in totals.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load report with `includeManualWriteback:true` after a leaf edit | Shows edited value |
| 2 | Load report with `includeManualWriteback:false` | Shows original base value |
| 3 | Synthetic rows with `includeManualWriteback:false` | Synthetic row NOT in response |
| 4 | In browser: "Include manual write-backs" toggle OFF | Totals revert to base data |

**Pass criteria:** Values differ when toggle changes; synthetic rows hidden when off.

---

### F17 — Secondary Filters (Cost Center / CO / Counterpart)

**Objective:** Advanced filters narrow data to specific dimensions.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load report with `costCenterCodes:[]` | Full Revenue total |
| 2 | Load report with `costCenterCodes:["CC_CORP"]` | Revenue from CC_CORP only |
| 3 | Load report with `costCenterCodes:["CC_OPS"]` | Revenue from CC_OPS only (may be 0 if OPS has no revenue) |
| 4 | Load with `coCodes:["CO1"]` | Filtered by CO |
| 5 | In browser: expand advanced filters, select CC → Apply | Grid updates |

**Pass criteria:** Filtered totals differ from unfiltered totals.

---

## OWASP Top 10 Security Checks

| Check | How to Verify |
|-------|--------------|
| A01 Broken Access Control | POST save for entity not in user's permissions → 403 |
| A02 Cryptographic Failures | `.env` not committed; JWT_SECRET not in code |
| A03 Injection | Parameterized queries in reportQueryBuilder — no string concat of user data |
| A04 Insecure Design | No debug endpoints; health has no sensitive data |
| A05 Security Misconfiguration | CORS whitelist; no `*`; no stack traces in responses |
| A07 Auth Failures | All routes (except /health) require valid JWT; expired token → 401 |
| A09 Logging Failures | Errors logged server-side; no stack traces to client |

---

## WCAG 2.1 AA Checks

| Criterion | How to Verify |
|-----------|--------------|
| 1.1.1 Non-text content | All inputs have `<label>` or `aria-label` |
| 1.4.3 Contrast | Background/text colors meet 4.5:1 ratio (grey #666 on white, etc.) |
| 2.1.1 Keyboard | All dropdowns, buttons, grid cells accessible via Tab/Enter/Escape |
| 4.1.3 Status messages | `aria-live="polite"` regions for loading and error states |

---

## Automated Test Run

```bash
# From backend/ directory
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./data/cfs.db');
db.exec('DELETE FROM app_DeltaAudit; DELETE FROM app_SyntheticRclMember; DELETE FROM app_Delta');

// Run integration test script
" && node integration-tests.js
```

All 17 requirements validated automatically. See `backend/integration-tests.js` for the full automated suite.
