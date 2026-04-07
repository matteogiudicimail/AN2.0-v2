/**
 * dataEntryService — barrel re-export for backward compatibility.
 *
 * This file was split into focused modules:
 *   dataEntryHelpers.ts            — pure utility functions
 *   dataEntryHierarchyBuilderService.ts — hierarchy builders
 *   dataEntryGridService.ts        — grid loading (getDataEntryGrid)
 *   dataEntryCellService.ts        — cell write/history (saveCell, getCellHistory, ensureWriteTable)
 *   rowApprovalService.ts          — row approval persistence
 *
 * [V5] Barrel is <30 lines; all logic in the individual modules.
 */

export { getDataEntryGrid }    from './dataEntryGridService';
export { saveCell, getCellHistory, ensureWriteTable } from './dataEntryCellService';
