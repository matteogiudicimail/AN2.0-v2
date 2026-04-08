import { mesaDataSource } from '../../config/mesaDb';
import { MesaValidation } from '../../entities/mesa/Validation';

interface CellInput {
  kpiId: number; dimensionValueId: number; numericValue: number | null;
}

interface ValidationWarning {
  kpiId: number; dimensionValueId: number; rule: string; severity: string; message: string;
}

export class MesaValidationService {
  private get repo() { return mesaDataSource.getRepository(MesaValidation); }

  async findByKpiIds(kpiIds: number[]): Promise<MesaValidation[]> {
    if (!kpiIds.length) return [];
    return this.repo
      .createQueryBuilder('v')
      .where('v.kpi IN (:...kpiIds)', { kpiIds })
      .getMany();
  }

  evaluateCells(validations: MesaValidation[], cells: CellInput[]): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const rulesByKpi = new Map<number, MesaValidation[]>();
    for (const v of validations) {
      const id = (v.kpi as any)?.id ?? (v as any).kpiId;
      if (!rulesByKpi.has(id)) rulesByKpi.set(id, []);
      rulesByKpi.get(id)!.push(v);
    }

    for (const cell of cells) {
      const rules = rulesByKpi.get(cell.kpiId) ?? [];
      for (const rule of rules) {
        const val = cell.numericValue;
        let triggered = false;
        switch (rule.rule) {
          case 'NON_NEGATIVE': triggered = val !== null && val < 0; break;
          case 'INTEGER':      triggered = val !== null && !Number.isInteger(val); break;
          case 'MIN':          triggered = val !== null && rule.minValue !== null && val < rule.minValue; break;
          case 'MAX':          triggered = val !== null && rule.maxValue !== null && val > rule.maxValue; break;
          case 'REQUIRED':     triggered = val === null; break;
        }
        if (triggered) {
          warnings.push({
            kpiId: cell.kpiId, dimensionValueId: cell.dimensionValueId,
            rule: rule.rule, severity: rule.severity, message: rule.message,
          });
        }
      }
    }
    return warnings;
  }
}

export const mesaValidationService = new MesaValidationService();
