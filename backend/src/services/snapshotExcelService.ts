/**
 * snapshotExcelService — export/import Excel per snapshot ESG.
 *
 * Export modes:
 *   - 'grid'  : struttura identica al viewer (gruppi + foglie indentatate)
 *   - 'pivot' : solo le righe foglia, flat
 *
 * Struttura del file .xlsx:
 *   Sheet "Dati"  — visibile; celle valore editabili (gialle); dimensioni locked (grigie)
 *   Sheet "_meta" — veryHidden; contiene snapshotId, filtri, mapping righe/colonne per reimport
 *
 * [V3] Nessuna concatenazione di input utente in SQL — l'import usa saveSnapshotCell
 *      che già parametrizza tutte le query.
 * [V4] Errori esposti come messaggi comprensibili, nessun stack trace.
 */

import * as ExcelJS from 'exceljs';
import { DataEntryGridResponse, SaveCellDto, WriteRow } from '../models/dataEntry.models';

// ── Palette colori ─────────────────────────────────────────────────────────────

const C = {
  titleBg:    'FF1F3864',
  titleFg:    'FFFFFFFF',
  headerBg:   'FF2E75B6',
  headerFg:   'FFFFFFFF',
  groupBg:    'FFD6E4F0',
  groupFg:    'FF1F3864',
  dimBg:      'FFF2F2F2',   // grigio: cella dimensione (locked)
  editBg:     'FFFFFACD',   // giallo chiaro: cella valore (editable)
  editAltBg:  'FFFFF0A0',   // giallo leggermente più intenso per righe alternate
  borderMain: 'FF8EA9C1',
  borderLight:'FFDDDDDD',
} as const;

// ── Tipi interni ───────────────────────────────────────────────────────────────

type Layout   = DataEntryGridResponse['layout'];
type RigaOpt  = DataEntryGridResponse['rowOptions'][number];

interface RowMeta {
  excelRow:   number;
  pathValues: Record<string, string>;
  isLeaf:     boolean;
}

export interface ExportOptions {
  snapshotId: number;
  taskLabel:  string;
  mode:       'grid' | 'pivot';
  filters:    Record<string, string>;
  grid:       DataEntryGridResponse;
}

export interface ImportResult {
  imported: number;
  errors:   string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function solid(argb: string): ExcelJS.FillPattern {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function applyStyle(cell: ExcelJS.Cell, s: {
  font?:      Partial<ExcelJS.Font>;
  fill?:      ExcelJS.FillPattern;
  alignment?: Partial<ExcelJS.Alignment>;
  border?:    Partial<ExcelJS.Borders>;
  numFmt?:    string;
}): void {
  if (s.font)      cell.font      = s.font      as ExcelJS.Font;
  if (s.fill)      cell.fill      = s.fill;
  if (s.alignment) cell.alignment = s.alignment as ExcelJS.Alignment;
  if (s.border)    cell.border    = s.border    as ExcelJS.Borders;
  if (s.numFmt)    cell.numFmt    = s.numFmt;
}

/** Applica i filtri alle colonne tenendo conto di filtriColonneMapping. */
function filterColValues(
  allValues: string[],
  colonnaField: string,
  filters: Record<string, string>,
  colMapping?: Record<string, Record<string, string[]>>,
): string[] {
  let result = [...allValues];
  const direct = filters[colonnaField];
  if (direct) return result.filter(v => v === direct);
  if (colMapping) {
    for (const [ff, byVal] of Object.entries(colMapping)) {
      const sel = filters[ff];
      if (!sel) continue;
      const allowed = byVal[sel];
      if (allowed) result = result.filter(v => allowed.includes(v));
    }
  }
  return result;
}

/** Applica i filtri alle righe (logica identica a _computeVisibleRows nel frontend). */
function filterRows(
  allRows: RigaOpt[],
  layout: Layout,
  filters: Record<string, string>,
  dimMapping?: Record<string, Record<string, string[]>>,
): RigaOpt[] {
  const rowFields = new Set(layout.rows.map(r => r.fieldName));
  let result = [...allRows];
  for (const [field, val] of Object.entries(filters)) {
    if (!val) continue;
    if (rowFields.has(field)) {
      result = result.filter(r => r.pathValues[field] === undefined || r.pathValues[field] === val);
    } else if (dimMapping?.[field]) {
      const valid = new Set<string>(dimMapping[field][val] ?? []);
      const pf = layout.rows[0]?.fieldName;
      if (pf) result = result.filter(r => r.pathValues[pf] === undefined || valid.has(r.pathValues[pf]));
    }
  }
  return result;
}

/** Cerca il valore di cella nelle writeRows data la combinazione di dimensioni. */
function getCellValue(
  writeRows: WriteRow[],
  dimValues: Record<string, string>,
  valoreField: string,
): number | null {
  // Ricerca per corrispondenza esatta (tutte le dimensioni devono coincidere)
  const match = writeRows.find(wr =>
    Object.entries(dimValues).every(([k, v]) => wr.dimensionValues[k] === v),
  );
  const raw = match?.values[valoreField] ?? null;
  if (raw === null) return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

// ── Export ─────────────────────────────────────────────────────────────────────

export async function exportSnapshotExcel(opts: ExportOptions): Promise<Buffer> {
  const { snapshotId, taskLabel, mode, filters, grid } = opts;
  const layout = grid.layout;

  // Risolvi colonne
  const colonnaField = layout.columns[0]?.fieldName ?? '';
  const allColValues = (grid as any).colonneOptions?.[0]?.values
    ?? (grid as any).columnOptions?.[0]?.values
    ?? [];
  const colValues = allColValues.length
    ? filterColValues(allColValues, colonnaField, filters, (grid as any).filtriColonneMapping)
    : [''];
  const valFields   = layout.values.map(v => v.fieldName);
  const numValCols  = colValues.length * valFields.length;

  // Risolvi righe (filtra + per pivot prendi solo le foglie)
  const allRows      = (grid as any).righeOptions ?? (grid as any).rowOptions ?? [];
  const filteredRows = filterRows(allRows, layout, filters, (grid as any).filtriDimMapping);
  const exportRows   = mode === 'pivot' ? filteredRows.filter((r: RigaOpt) => r.isLeaf) : filteredRows;

  const wb = new ExcelJS.Workbook();
  wb.creator  = 'ESG Configurator';
  wb.created  = new Date();

  // ── Foglio "Dati" ─────────────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Dati', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }],
  });

  ws.getColumn(1).width = 54;
  for (let c = 2; c <= 1 + numValCols; c++) ws.getColumn(c).width = 16;

  // Riga 1: titolo
  ws.mergeCells(1, 1, 1, Math.max(2, 1 + numValCols));
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${taskLabel}  ·  snap #${snapshotId}  ·  ${mode === 'grid' ? 'Griglia' : 'Pivot'}`;
  applyStyle(titleCell, {
    font:      { bold: true, color: { argb: C.titleFg }, size: 12 },
    fill:      solid(C.titleBg),
    alignment: { horizontal: 'left', vertical: 'middle' },
  });
  ws.getRow(1).height = 24;

  // Riga 2: intestazioni colonne
  const h1 = ws.getCell(2, 1);
  h1.value = layout.rows.map(r => r.label).join(' / ');
  applyStyle(h1, {
    font:      { bold: true, color: { argb: C.headerFg } },
    fill:      solid(C.headerBg),
    alignment: { horizontal: 'left', vertical: 'middle' },
    border:    { bottom: { style: 'medium', color: { argb: C.borderMain } } },
  });
  h1.protection = { locked: true };

  let hc = 2;
  for (const cv of colValues) {
    for (const vf of valFields) {
      const vLabel = layout.values.find(v => v.fieldName === vf)?.label ?? vf;
      const label  = valFields.length > 1
        ? `${cv || '—'}\n${vLabel}`
        : (cv || vLabel);
      const cell = ws.getCell(2, hc);
      cell.value  = label;
      cell.protection = { locked: true };
      applyStyle(cell, {
        font:      { bold: true, color: { argb: C.headerFg } },
        fill:      solid(C.headerBg),
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
        border:    {
          bottom: { style: 'medium', color: { argb: C.borderMain } },
          left:   { style: 'thin',   color: { argb: C.borderMain } },
        },
      });
      hc++;
    }
  }
  ws.getRow(2).height = valFields.length > 1 ? 32 : 22;

  // Righe dati
  let excelRowNum  = 3;
  let leafCount    = 0;
  const rowMeta: RowMeta[] = [];

  for (const r of exportRows as RigaOpt[]) {
    const row = ws.getRow(excelRowNum);
    row.height = 17;

    if (!r.isLeaf) {
      // Riga gruppo (solo mode=grid)
      ws.mergeCells(excelRowNum, 1, excelRowNum, Math.max(2, 1 + numValCols));
      const gc = ws.getCell(excelRowNum, 1);
      gc.value = r.label;
      gc.protection = { locked: true };
      applyStyle(gc, {
        font:      { bold: true, color: { argb: C.groupFg }, size: 10 },
        fill:      solid(C.groupBg),
        alignment: { horizontal: 'left', vertical: 'middle', indent: r.depth },
        border:    { top: { style: 'thin', color: { argb: C.borderMain } } },
      });
      row.height = 18;
      rowMeta.push({ excelRow: excelRowNum, pathValues: r.pathValues, isLeaf: false });

    } else {
      const alt      = leafCount % 2 === 1;
      const indent   = (r as any).paramRow?.indentLevel ?? r.depth;
      const labelCell = ws.getCell(excelRowNum, 1);
      labelCell.value = r.label;
      labelCell.protection = { locked: true };
      applyStyle(labelCell, {
        font:      { color: { argb: 'FF333333' }, size: 10 },
        fill:      solid(alt ? C.dimBg : 'FFF7FAFD'),
        alignment: { horizontal: 'left', vertical: 'middle', indent },
        border:    {
          right:  { style: 'thin', color: { argb: C.borderLight } },
          bottom: { style: 'hair', color: { argb: C.borderLight } },
        },
      });

      let vc = 2;
      for (const cv of colValues) {
        for (const vf of valFields) {
          const dims: Record<string, string> = { ...filters, ...r.pathValues };
          if (colonnaField && cv) dims[colonnaField] = cv;

          const numVal = getCellValue(grid.writeRows, dims, vf);
          const cell   = ws.getCell(excelRowNum, vc);
          cell.value   = numVal;
          cell.protection = { locked: false };  // ← EDITABILE
          applyStyle(cell, {
            fill:      solid(alt ? C.editAltBg : C.editBg),
            alignment: { horizontal: 'right', vertical: 'middle' },
            numFmt:    '#,##0.##',
            border:    {
              left:   { style: 'thin', color: { argb: C.borderLight } },
              bottom: { style: 'hair', color: { argb: C.borderLight } },
            },
          });
          vc++;
        }
      }

      rowMeta.push({ excelRow: excelRowNum, pathValues: r.pathValues, isLeaf: true });
      leafCount++;
    }
    excelRowNum++;
  }

  // Protezione foglio: locked=true (default) + celle gialle locked=false
  await (ws as any).protect('', {
    selectLockedCells:   true,
    selectUnlockedCells: true,
    formatCells:         false,
    formatColumns:       false,
    formatRows:          false,
    insertRows:          false,
    deleteRows:          false,
    sort:                false,
    autoFilter:          false,
  });

  // ── Foglio "_meta" (veryHidden) ───────────────────────────────────────────────
  const wm = wb.addWorksheet('_meta');
  (wm as any).state = 'veryHidden';

  wm.getCell('A1').value = 'snapshotId';    wm.getCell('B1').value = snapshotId;
  wm.getCell('A2').value = 'mode';          wm.getCell('B2').value = mode;
  wm.getCell('A3').value = 'filters';       wm.getCell('B3').value = JSON.stringify(filters);
  wm.getCell('A4').value = 'colonnaField';  wm.getCell('B4').value = colonnaField;
  wm.getCell('A5').value = 'colonnaValues'; wm.getCell('B5').value = JSON.stringify(colValues);
  wm.getCell('A6').value = 'valoreFields';  wm.getCell('B6').value = JSON.stringify(valFields);
  wm.getCell('A7').value = 'numValCols';    wm.getCell('B7').value = numValCols;

  let mr = 9;
  for (const rm of rowMeta) {
    wm.getCell(mr, 1).value = rm.excelRow;
    wm.getCell(mr, 2).value = JSON.stringify(rm.pathValues);
    wm.getCell(mr, 3).value = rm.isLeaf ? 1 : 0;
    mr++;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

// ── Import ─────────────────────────────────────────────────────────────────────

export async function importSnapshotExcel(
  snapshotId: number,
  buffer:     Buffer,
  saveFn:     (dto: SaveCellDto) => Promise<void>,
): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  // Leggi foglio _meta
  const wm = wb.getWorksheet('_meta');
  if (!wm) {
    const e = new Error('File non valido: foglio _meta mancante. Usare il file esportato dal sistema.');
    (e as any).statusCode = 400;
    throw e;
  }

  const fileSnapId = Number(wm.getCell('B1').value);
  if (fileSnapId !== snapshotId) {
    const e = new Error(
      `Il file è stato esportato da snap #${fileSnapId} — non corrisponde a snap #${snapshotId}.`,
    );
    (e as any).statusCode = 400;
    throw e;
  }

  const filters:     Record<string, string> = JSON.parse(String(wm.getCell('B3').value ?? '{}'));
  const colonnaField = String(wm.getCell('B4').value ?? '');
  const colValues:   string[]               = JSON.parse(String(wm.getCell('B5').value ?? '[]'));
  const valFields:   string[]               = JSON.parse(String(wm.getCell('B6').value ?? '[]'));

  // Mappa excelRow → pathValues (solo righe foglia)
  const rowMetaMap = new Map<number, Record<string, string>>();
  wm.eachRow((row, rowNum) => {
    if (rowNum < 9) return;
    const excelRow = Number(row.getCell(1).value);
    const pvJson   = String(row.getCell(2).value ?? '');
    const isLeaf   = Number(row.getCell(3).value) === 1;
    if (excelRow && pvJson && isLeaf) {
      try { rowMetaMap.set(excelRow, JSON.parse(pvJson)); } catch { /* skip malformed */ }
    }
  });

  // Leggi foglio Dati
  const ws = wb.getWorksheet('Dati');
  if (!ws) {
    const e = new Error('File non valido: foglio Dati mancante.');
    (e as any).statusCode = 400;
    throw e;
  }

  // Raccolta modifiche (sincrono)
  const changes: Array<{
    dto:    SaveCellDto;
    rowNum: number;
    colNum: number;
  }> = [];

  ws.eachRow((row, rowNum) => {
    const pathValues = rowMetaMap.get(rowNum);
    if (!pathValues) return;  // Non è una riga foglia

    let offset = 0;
    for (const cv of colValues) {
      for (const vf of valFields) {
        const cell = row.getCell(2 + offset);
        const raw  = cell.value;
        // Celle vuote = ignorate (merge mode)
        if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
          const dims: Record<string, string> = { ...filters, ...pathValues };
          if (colonnaField && cv) dims[colonnaField] = cv;
          changes.push({
            dto:    { dimensionValues: dims, valoreField: vf, value: String(raw).trim() },
            rowNum, colNum: 2 + offset,
          });
        }
        offset++;
      }
    }
  });

  // Esecuzione modifiche (asincrona)
  let imported = 0;
  const errors: string[] = [];

  for (const ch of changes) {
    const num = parseFloat(ch.dto.value);
    if (isNaN(num)) {
      errors.push(`Riga ${ch.rowNum}, colonna ${ch.colNum}: valore non numerico "${ch.dto.value}"`);
      continue;
    }
    try {
      await saveFn({ ...ch.dto, value: String(num) });
      imported++;
    } catch (e: unknown) {
      errors.push(`Riga ${ch.rowNum}: ${(e as Error).message ?? 'errore sconosciuto'}`);
    }
  }

  return { imported, errors };
}
