/**
 * dataEntryAdjService — gestione righe "Rett. Manuale" (Manual Adjustment)
 * per le righe di tipo Aggregato nella scheda Data Entry.
 *
 * Separato da dataEntryService.ts per rispettare V5 (limite ~400 righe).
 *
 * [V3] Identificatori SQL validati con assertValidIdentifier + bracket-quoting.
 *      Valori passati come parametri ? — mai interpolati.
 * [V6] Logica di dominio qui; la route orchestra soltanto.
 */

import { dbGet, dbRun } from '../config/dbHelpers';
import { assertValidIdentifier } from './paramTableService';
import { EnsureAdjDto, EnsureAdjResult, DataEntryGridResponse } from '../models/dataEntry.models';

// ── Public: ensureManualAdjRow ────────────────────────────────────────────────

/**
 * Garantisce l'esistenza di una riga "Rett. Manuale" nella tabella _PARAM
 * associata al campo righe indicato, sotto l'Aggregato parentSourceValue.
 *
 * - Se la riga esiste già → ritorna { created: false, adjSourceValue }
 * - Se non esiste → la crea (Indicatore, isEditable=1, IndentLevel=2)
 *   e ritorna { created: true, adjSourceValue }
 *
 * SourceValue sintetico: `_MANUAL_ADJ_{parentSourceValue}`
 */
export async function ensureManualAdjRow(
  reportId: number,
  dto: EnsureAdjDto,
): Promise<EnsureAdjResult> {
  const { rigaFieldName, parentSourceValue } = dto;

  // 1. Validazione input — le route già validano, questo è defensive programming
  if (!rigaFieldName || typeof rigaFieldName !== 'string' || rigaFieldName.trim() === '') {
    const e = new Error('rigaFieldName mancante');
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  if (!parentSourceValue || typeof parentSourceValue !== 'string' || parentSourceValue.trim() === '') {
    const e = new Error('parentSourceValue mancante');
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }

  // 2. Carica il layout per trovare il paramTableId del campo righe
  const layoutRow = await dbGet<{ ConfigJson: string }>(
    'SELECT ConfigJson FROM dbo.cfg_EntryLayout WHERE ReportId = ?',
    reportId,
  );
  if (!layoutRow) {
    const e = new Error('Entry layout non trovato');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }
  const layout = JSON.parse(layoutRow.ConfigJson) as DataEntryGridResponse['layout'];

  const righeItem = layout.righe.find((r) => r.fieldName === rigaFieldName);
  if (!righeItem) {
    const e = new Error(`Campo righe "${rigaFieldName}" non presente nel layout`);
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  if (!righeItem.paramTableId) {
    const e = new Error(`Il campo righe "${rigaFieldName}" non ha una tabella PARAM associata`);
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }

  // 3. Risolve schema + nome tabella _PARAM dal registry
  const reg = await dbGet<{ SchemaName: string; ParamTableName: string }>(
    'SELECT SchemaName, ParamTableName FROM dbo.cfg_ParamTable WHERE ParamTableId = ?',
    righeItem.paramTableId,
  );
  if (!reg) {
    const e = new Error('Tabella PARAM non trovata nel registry');
    (e as Error & { statusCode: number }).statusCode = 404;
    throw e;
  }
  assertValidIdentifier(reg.SchemaName,     'paramSchema');
  assertValidIdentifier(reg.ParamTableName, 'paramTableName');

  const adjSourceValue = `_MANUAL_ADJ_${parentSourceValue}`;

  // 4. Controlla se la riga Manual Adj esiste già (idempotente)
  const existing = await dbGet<{ ParamId: number }>(
    `SELECT ParamId FROM [${reg.SchemaName}].[${reg.ParamTableName}] WHERE SourceValue = ?`,
    adjSourceValue,
  );
  if (existing) {
    return { created: false, adjSourceValue };
  }

  // 5. Trova la riga padre (Aggregato) per ricavare ParamId e SortOrder
  const parent = await dbGet<{ ParamId: number; SortOrder: number }>(
    `SELECT ParamId, SortOrder FROM [${reg.SchemaName}].[${reg.ParamTableName}] WHERE SourceValue = ?`,
    parentSourceValue,
  );
  const adjSortOrder  = parent ? parent.SortOrder + 1 : 0;
  const parentParamId = parent ? parent.ParamId : null;

  // 6. Inserisce la nuova riga Manual Adj
  //    - RowKind='Indicatore', isEditable=1, IndentLevel=2
  //    - ParentParamId = ParamId dell'Aggregato (se trovato)
  //    - SourceValue sintetico non corrisponde ad alcun valore reale del DB
  await dbRun(
    `INSERT INTO [${reg.SchemaName}].[${reg.ParamTableName}]
       (SourceValue, Label, RowKind, IndentLevel, ParentParamId,
        IsEditable, IsFormula, IsVisible, SortOrder,
        CreatedBy, CreatedAt)
     VALUES (?, N'Rett. Manuale', 'Indicatore', 2, ?,
             1, 0, 1, ?,
             N'system', SYSUTCDATETIME())`,
    adjSourceValue,
    parentParamId,
    adjSortOrder,
  );

  return { created: true, adjSourceValue };
}
