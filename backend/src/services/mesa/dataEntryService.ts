import { mesaDataSource } from '../../config/mesaDb';
import { MesaFactValue } from '../../entities/mesa/FactValue';
import { MesaKpi } from '../../entities/mesa/Kpi';
import { MesaDimensionValue } from '../../entities/mesa/DimensionValue';
import { mesaMasterDataService } from './masterDataService';
import { mesaSecurityService } from './securityService';
import { mesaAuditService } from './auditService';
import { mesaCommentsService } from './commentsService';
import { mesaValidationService } from './validationService';
import { broadcastCellSaved } from './realtimeGateway';

interface CellChange {
  kpiId: number; dimensionValueId: number; numericValue: number | null; source?: string;
}

export class MesaDataEntryService {
  private get factRepo() { return mesaDataSource.getRepository(MesaFactValue); }

  async getGrid(reportId: number, sectionId: number, userId: number) {
    const [kpis, scopedIds, kpiIdsWithComments, filterEnabled] = await Promise.all([
      mesaMasterDataService.findKpisBySection(sectionId, true),
      mesaSecurityService.getScopedDimensionValueIds(userId),
      mesaCommentsService.getKpiIdsWithComments(reportId, sectionId),
      mesaMasterDataService.hasFilterDimension(reportId),
    ]);

    const validations = await mesaValidationService.findByKpiIds(kpis.map((k) => k.id));
    const columns = await mesaMasterDataService.findColumnValues(reportId, scopedIds);

    const facts = await this.factRepo.find({
      where: { report: { id: reportId }, section: { id: sectionId } },
      relations: ['kpi', 'dimensionValue'],
    });

    const factLookup = new Map<string, number | null>();
    for (const f of facts) {
      factLookup.set(`${(f.kpi as MesaKpi).id}-${(f.dimensionValue as MesaDimensionValue).id}`, f.numericValue ?? null);
    }

    const subSectionMap = new Map<string, { code: string; name: string; rows: unknown[] }>();
    const subSectionOrder: string[] = [];

    for (const kpi of kpis) {
      const ssKey = kpi.subSection ?? '__root__';
      const ssName = kpi.subSection ? kpi.subSection.toUpperCase() : '';

      if (!subSectionMap.has(ssKey)) {
        subSectionMap.set(ssKey, { code: ssKey, name: ssName, rows: [] });
        subSectionOrder.push(ssKey);
      }

      const rowValues = columns.map((col) => {
        const val = factLookup.get(`${kpi.id}-${col.id}`) ?? null;
        return { dimensionValueId: col.id, numericValue: val, isEmpty: val === null || val === 0, isReadonly: kpi.isCalculated };
      });

      if (kpi.isCalculated && kpi.formulaType) {
        const childKpis = kpis.filter((k) => (k.parent as MesaKpi)?.id === kpi.id);
        for (let i = 0; i < rowValues.length; i++) {
          const col = columns[i];
          const childVals = childKpis
            .map((ck) => factLookup.get(`${ck.id}-${col.id}`) ?? null)
            .filter((v): v is number => v !== null);
          let computed: number | null = null;
          switch (kpi.formulaType) {
            case 'SUM':   computed = childVals.reduce((a, b) => a + b, 0); break;
            case 'AVG':   computed = childVals.length ? childVals.reduce((a, b) => a + b, 0) / childVals.length : null; break;
            case 'RATIO': computed = childVals.length >= 2 && childVals[1] !== 0 ? (childVals[0] / childVals[1]) * 100 : null; break;
          }
          rowValues[i] = { ...rowValues[i], numericValue: computed, isEmpty: computed === null || computed === 0, isReadonly: true };
        }
      }

      const labelMap: Record<string, string> = { SUM: 'somma', AVG: 'media', RATIO: 'rapporto' };
      const formulaTag = kpi.isCalculated && kpi.formulaType
        ? (kpi.formulaOperandCount ? `= ${labelMap[kpi.formulaType] ?? kpi.formulaType.toLowerCase()} ${kpi.formulaOperandCount}` : `= ${labelMap[kpi.formulaType] ?? kpi.formulaType.toLowerCase()}`)
        : null;

      subSectionMap.get(ssKey)!.rows.push({
        kpiId: kpi.id, kpiName: kpi.name, unit: kpi.unit,
        isCalculated: kpi.isCalculated, formulaTag,
        isBold: kpi.isBold, indentLevel: kpi.indentLevel,
        hasComment: kpiIdsWithComments.has(kpi.id),
        values: rowValues,
      });
    }

    const allCells = [...subSectionMap.values()].flatMap((ss) =>
      (ss.rows as any[]).flatMap((row) =>
        row.values.map((v: any) => ({ kpiId: row.kpiId, dimensionValueId: v.dimensionValueId, numericValue: v.numericValue })),
      ),
    );
    const warnings = mesaValidationService.evaluateCells(validations, allCells);

    return {
      reportId, sectionId, filterEnabled,
      columns: columns.map((c) => ({ id: c.id, code: c.code, name: c.name ?? c.code })),
      subSections: subSectionOrder.map((k) => subSectionMap.get(k)!),
      warnings,
    };
  }

  async saveCells(reportId: number, sectionId: number, changes: CellChange[], userId: number) {
    let saved = 0;
    const errors: string[] = [];
    const recalculated: { kpiId: number; dimensionValueId: number; numericValue: number }[] = [];

    await mesaDataSource.transaction(async (em) => {
      for (const change of changes) {
        try {
          const existing = await em.findOne(MesaFactValue, {
            where: {
              report: { id: reportId }, section: { id: sectionId },
              kpi: { id: change.kpiId }, dimensionValue: { id: change.dimensionValueId },
            },
          });

          const oldValue = existing?.numericValue?.toString() ?? null;
          if (existing) {
            existing.numericValue = change.numericValue;
            (existing as any).updatedBy = { id: userId };
            await em.save(existing);
            await mesaAuditService.record(em, { factValueId: existing.id, userId, oldValue, newValue: change.numericValue?.toString() ?? null, source: change.source ?? 'MANUAL' });
          } else {
            const fv = em.create(MesaFactValue);
            (fv as any).report = { id: reportId };
            (fv as any).section = { id: sectionId };
            (fv as any).kpi = { id: change.kpiId };
            (fv as any).dimensionValue = { id: change.dimensionValueId };
            fv.numericValue = change.numericValue;
            (fv as any).updatedBy = { id: userId };
            const saved_ = await em.save(fv);
            await mesaAuditService.record(em, { factValueId: saved_.id, userId, oldValue: null, newValue: change.numericValue?.toString() ?? null, source: change.source ?? 'MANUAL' });
          }
          saved++;
        } catch (err) {
          errors.push(`kpi=${change.kpiId} dim=${change.dimensionValueId}: ${(err as Error).message}`);
        }
      }

      // Recalculate parent SUM KPIs
      const kpis = await mesaMasterDataService.findKpisBySection(sectionId);
      for (const parentKpi of kpis.filter((k) => k.isCalculated && k.formulaType)) {
        const children = kpis.filter((k) => (k.parent as MesaKpi)?.id === parentKpi.id);
        const childIds = new Set(children.map((c) => c.id));
        const changed = changes.filter((c) => childIds.has(c.kpiId));
        if (!changed.length) continue;

        const dimValIds = [...new Set(changed.map((c) => c.dimensionValueId))];
        for (const dimValId of dimValIds) {
          const childFacts = await em.find(MesaFactValue, {
            where: children.map((ck) => ({
              report: { id: reportId }, section: { id: sectionId },
              kpi: { id: ck.id }, dimensionValue: { id: dimValId },
            })) as any,
          });
          const vals = childFacts.map((f) => f.numericValue).filter((v): v is number => v !== null);
          let computed = 0;
          switch (parentKpi.formulaType) {
            case 'AVG':   computed = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; break;
            case 'RATIO': computed = vals.length >= 2 && vals[1] !== 0 ? (vals[0] / vals[1]) * 100 : 0; break;
            default:      computed = vals.reduce((a, b) => a + b, 0);
          }
          recalculated.push({ kpiId: parentKpi.id, dimensionValueId: dimValId, numericValue: computed });
        }
      }
    });

    try {
      for (const change of changes) {
        broadcastCellSaved({ reportId, sectionId, kpiId: change.kpiId, dimensionValueId: change.dimensionValueId, numericValue: change.numericValue, userId });
      }
    } catch { /* gateway may not be ready */ }

    return { saved, errors, timestamp: new Date().toISOString(), recalculated };
  }
}

export const mesaDataEntryService = new MesaDataEntryService();
