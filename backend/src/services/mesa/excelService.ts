import * as ExcelJS from 'exceljs';
import { mesaDataEntryService } from './dataEntryService';
import { mesaReportConfigService } from './reportConfigService';

const MESA_GREEN       = 'FF8BC34A';
const MESA_GREEN_DARK  = 'FF7AB648';
const MESA_LIGHT_GREEN = 'FFE8F5E9';
const FROZEN_COLS      = 3;

interface CellChange {
  kpiId: number; dimensionValueId: number; numericValue: number | null; source?: string;
}

export class MesaExcelService {
  async generateTemplate(reportId: number, sectionId: number, userId: number): Promise<{ buffer: Buffer; filename: string }> {
    const [grid, section] = await Promise.all([
      mesaDataEntryService.getGrid(reportId, sectionId, userId),
      mesaReportConfigService.findSection(sectionId),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'MESA Data Collection';
    wb.created = new Date();

    const ws = wb.addWorksheet(section.name, {
      views: [{ state: 'frozen', xSplit: FROZEN_COLS, ySplit: 1 }],
    });

    const headerRow = ws.addRow(['KPI', 'u.m.', '', ...(grid.columns as any[]).map((c: any) => c.code)]);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MESA_GREEN } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { bottom: { style: 'medium', color: { argb: MESA_GREEN_DARK } } };
    });
    headerRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(1).height = 22;
    ws.getColumn(1).width = 35;
    ws.getColumn(2).width = 8;
    ws.getColumn(3).width = 5;
    for (let i = 4; i <= 3 + (grid.columns as any[]).length; i++) ws.getColumn(i).width = 12;

    for (const ss of (grid.subSections as any[])) {
      const ssRow = ws.addRow([`▶ ${ss.name}`, '', '', ...(grid.columns as any[]).map(() => '')]);
      ssRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MESA_GREEN } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      });
      ssRow.height = 18;

      for (const row of ss.rows as any[]) {
        const indent = '  '.repeat(row.indentLevel);
        const kpiLabel = indent + row.kpiName + (row.formulaTag ? ` [${row.formulaTag}]` : '');
        const values = row.values.map((v: any) => (v.numericValue !== null ? v.numericValue : ''));
        const exRow = ws.addRow([kpiLabel, row.unit, '', ...values]);
        exRow.height = 16;
        exRow.getCell(1).alignment = { horizontal: 'left', indent: row.indentLevel };
        exRow.getCell(1).font = row.isBold ? { bold: true } : {};
        for (let ci = 4; ci <= 3 + values.length; ci++) {
          const cell = exRow.getCell(ci);
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right' };
          if (row.isCalculated) { cell.font = { italic: true, color: { argb: 'FF999999' } }; }
          else { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MESA_LIGHT_GREEN } }; }
          cell.border = { bottom: { style: 'hair', color: { argb: 'FFEEEEEE' } } };
        }
      }
    }

    const metaWs = wb.addWorksheet('_mesa_meta');
    metaWs.addRow(['reportId', reportId]);
    metaWs.addRow(['sectionId', sectionId]);
    metaWs.addRow(['generated', new Date().toISOString()]);
    metaWs.addRow(['columns', (grid.columns as any[]).map((c: any) => `${c.id}:${c.code}`).join('|')]);
    metaWs.state = 'hidden';

    const buffer = await wb.xlsx.writeBuffer();
    const filename = `MESA_RPT_${section.code}_${section.name.replace(/\s+/g, '_')}.xlsx`;
    return { buffer: Buffer.from(buffer), filename };
  }

  async parseImport(buffer: Buffer, reportId: number, sectionId: number, userId: number): Promise<{
    matchedCells: number; unmatchedColumns: string[]; unmatchedRows: string[]; changes: CellChange[];
  }> {
    const wb = new ExcelJS.Workbook();
    await (wb.xlsx as any).load(buffer);

    const metaWs = wb.getWorksheet('_mesa_meta');
    if (!metaWs) throw Object.assign(new Error('Invalid MESA template: missing metadata sheet'), { status: 400 });

    const columnMapRaw = metaWs.getRow(4).getCell(2).value as string;
    const columnMap = new Map<string, number>();
    if (columnMapRaw) {
      for (const pair of columnMapRaw.split('|')) {
        const [id, code] = pair.split(':');
        columnMap.set(code, parseInt(id, 10));
      }
    }

    const grid = await mesaDataEntryService.getGrid(reportId, sectionId, userId);
    const kpiNameMap = new Map<string, number>();
    for (const ss of (grid.subSections as any[])) {
      for (const row of ss.rows as any[]) {
        if (!row.isCalculated) kpiNameMap.set(row.kpiName.trim().toLowerCase(), row.kpiId);
      }
    }

    const dataWs = wb.worksheets.find((ws) => ws.state !== 'hidden');
    if (!dataWs) throw Object.assign(new Error('No data worksheet found'), { status: 400 });

    const changes: CellChange[] = [];
    const unmatchedColumns: string[] = [];
    const unmatchedRows: string[] = [];
    const colIndexToDimId = new Map<number, number>();

    dataWs.getRow(1).eachCell((cell, colNum) => {
      if (colNum <= FROZEN_COLS) return;
      const code = String(cell.value ?? '').trim();
      if (columnMap.has(code)) { colIndexToDimId.set(colNum, columnMap.get(code)!); }
      else if (code) { if (!unmatchedColumns.includes(code)) unmatchedColumns.push(code); }
    });

    dataWs.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const kpiLabel = String(row.getCell(1).value ?? '').trim();
      const kpiNameClean = kpiLabel.replace(/▶\s*/g, '').replace(/\[.*?\]/g, '').trim().toLowerCase();
      if (!kpiNameClean || kpiNameClean.startsWith('▶')) return;

      const kpiId = kpiNameMap.get(kpiNameClean);
      if (!kpiId) { if (kpiNameClean) unmatchedRows.push(kpiLabel); return; }

      row.eachCell((cell, colNum) => {
        if (colNum <= FROZEN_COLS) return;
        const dimId = colIndexToDimId.get(colNum);
        if (!dimId) return;
        const raw = cell.value;
        if (raw === null || raw === undefined || raw === '') return;
        const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
        if (isNaN(num)) return;
        changes.push({ kpiId, dimensionValueId: dimId, numericValue: num, source: 'EXCEL' });
      });
    });

    return { matchedCells: changes.length, unmatchedColumns, unmatchedRows, changes };
  }

  async confirmImport(reportId: number, sectionId: number, changes: CellChange[], userId: number) {
    return mesaDataEntryService.saveCells(reportId, sectionId, changes, userId);
  }
}

export const mesaExcelService = new MesaExcelService();
