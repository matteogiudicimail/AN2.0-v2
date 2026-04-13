import { mesaDataSource } from '../../config/mesaDb';
import { MesaKpi } from '../../entities/mesa/Kpi';
import { MesaDimension } from '../../entities/mesa/Dimension';
import { MesaDimensionValue } from '../../entities/mesa/DimensionValue';
import { MesaReportDimension } from '../../entities/mesa/ReportDimension';
import { MesaSection } from '../../entities/mesa/Section';

interface CreateKpiDto {
  name: string; unit?: string; subSection?: string; isCalculated?: boolean;
  formulaType?: string | null; formulaOperandCount?: number | null;
  sortOrder?: number; sectionId: number; parentKpiId?: number | null;
}

export class MesaMasterDataService {
  private get kpiRepo()       { return mesaDataSource.getRepository(MesaKpi); }
  private get dimRepo()       { return mesaDataSource.getRepository(MesaDimension); }
  private get reportDimRepo() { return mesaDataSource.getRepository(MesaReportDimension); }

  findKpisBySection(sectionId: number, enabledOnly = false): Promise<MesaKpi[]> {
    const where: Record<string, unknown> = { section: { id: sectionId } };
    if (enabledOnly) where['isEnabled'] = true;
    return this.kpiRepo.find({ where, relations: ['parent'], order: { sortOrder: 'ASC' } });
  }

  findAllDimensions(): Promise<MesaDimension[]> {
    return this.dimRepo.find({ relations: ['values'], order: { code: 'ASC' } });
  }

  async findColumnValues(reportId: number, scopedIds: number[] | null): Promise<MesaDimensionValue[]> {
    const rd = await this.reportDimRepo.findOne({
      where: { report: { id: reportId }, role: 'COLUMN' },
      relations: ['dimension', 'dimension.values'],
    });
    if (!rd) return [];

    let values = rd.dimension.values.sort((a, b) => a.sortOrder - b.sortOrder);
    if (rd.includedValueIds) {
      const included = JSON.parse(rd.includedValueIds) as number[];
      if (included.length > 0) values = values.filter((v) => included.includes(v.id));
    }
    if (scopedIds === null) return values;
    return values.filter((v) => scopedIds.includes(v.id));
  }

  async hasFilterDimension(reportId: number): Promise<boolean> {
    const count = await this.reportDimRepo.count({ where: { report: { id: reportId }, role: 'FILTER' } });
    return count > 0;
  }

  async findKpiById(id: number): Promise<MesaKpi> {
    const kpi = await this.kpiRepo.findOne({ where: { id }, relations: ['parent', 'children'] });
    if (!kpi) throw Object.assign(new Error(`KPI ${id} not found`), { status: 404 });
    return kpi;
  }

  async createKpi(dto: CreateKpiDto): Promise<MesaKpi> {
    const kpi = this.kpiRepo.create({
      name: dto.name, unit: dto.unit ?? 'n°', subSection: dto.subSection ?? '',
      isCalculated: dto.isCalculated ?? false,
      formulaType: dto.formulaType ?? null,
      formulaOperandCount: dto.formulaOperandCount ?? null,
      sortOrder: dto.sortOrder ?? 0,
      section: { id: dto.sectionId } as MesaSection,
      parent: dto.parentKpiId ? ({ id: dto.parentKpiId } as MesaKpi) : null,
    });
    return this.kpiRepo.save(kpi);
  }

  async updateKpi(id: number, dto: Partial<CreateKpiDto & { isEnabled: boolean }>): Promise<MesaKpi> {
    const kpi = await this.findKpiById(id);
    if (dto.name !== undefined)               kpi.name = dto.name;
    if (dto.unit !== undefined)               kpi.unit = dto.unit as string;
    if (dto.subSection !== undefined)         kpi.subSection = dto.subSection as string;
    if (dto.isCalculated !== undefined)       kpi.isCalculated = dto.isCalculated;
    if (dto.formulaType !== undefined)        kpi.formulaType = dto.formulaType ?? null;
    if (dto.formulaOperandCount !== undefined) kpi.formulaOperandCount = dto.formulaOperandCount ?? null;
    if (dto.sortOrder !== undefined)          kpi.sortOrder = dto.sortOrder;
    if (dto.isEnabled !== undefined)          kpi.isEnabled = dto.isEnabled;
    return this.kpiRepo.save(kpi);
  }

  async deleteKpi(id: number): Promise<void> {
    await this.kpiRepo.delete(id);
  }
}

export const mesaMasterDataService = new MesaMasterDataService();
