import { mesaDataSource } from '../../config/mesaDb';
import { MesaReport } from '../../entities/mesa/Report';
import { MesaSection } from '../../entities/mesa/Section';
import { MesaReportDimension } from '../../entities/mesa/ReportDimension';
import { MesaDimension } from '../../entities/mesa/Dimension';

type ReportAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'REOPEN';

export class MesaReportConfigService {
  private get reportRepo()  { return mesaDataSource.getRepository(MesaReport); }
  private get sectionRepo() { return mesaDataSource.getRepository(MesaSection); }
  private get rdRepo()      { return mesaDataSource.getRepository(MesaReportDimension); }
  private get dimRepo()     { return mesaDataSource.getRepository(MesaDimension); }

  findAll(): Promise<MesaReport[]> {
    return this.reportRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: number): Promise<MesaReport> {
    const report = await this.reportRepo.findOne({
      where: { id }, relations: ['sections'], order: { sections: { sortOrder: 'ASC' } },
    });
    if (!report) throw Object.assign(new Error(`Report ${id} not found`), { status: 404 });
    return report;
  }

  findSections(reportId: number): Promise<MesaSection[]> {
    return this.sectionRepo.find({ where: { report: { id: reportId } }, order: { sortOrder: 'ASC' } });
  }

  async findSection(sectionId: number): Promise<MesaSection> {
    const s = await this.sectionRepo.findOne({ where: { id: sectionId }, relations: ['report'] });
    if (!s) throw Object.assign(new Error(`Section ${sectionId} not found`), { status: 404 });
    return s;
  }

  async createReport(dto: { code: string; name: string; description?: string; period?: string }): Promise<MesaReport> {
    const report = this.reportRepo.create({ ...dto, status: 'DRAFT' });
    return this.reportRepo.save(report);
  }

  async createSection(reportId: number, dto: { code: string; name: string; sortOrder?: number }): Promise<MesaSection> {
    const report = await this.findOne(reportId);
    const maxOrder = await this.sectionRepo
      .createQueryBuilder('s')
      .select('MAX(s.sortOrder)', 'max')
      .where('s.report = :reportId', { reportId })
      .getRawOne() as { max: number | null };
    const section = this.sectionRepo.create({
      report, code: dto.code, name: dto.name,
      sortOrder: dto.sortOrder ?? (maxOrder.max ?? 0) + 10,
    });
    return this.sectionRepo.save(section);
  }

  async deleteSection(sectionId: number): Promise<void> {
    await this.sectionRepo.delete(sectionId);
  }

  async getDesignerConfig(reportId: number) {
    const [report, sections, dimensions, allDimensions] = await Promise.all([
      this.findOne(reportId),
      this.findSections(reportId),
      this.rdRepo.find({ where: { report: { id: reportId } }, relations: ['dimension', 'dimension.values'], order: { sortOrder: 'ASC' } }),
      this.dimRepo.find({ relations: ['values'], order: { code: 'ASC' } }),
    ]);
    return { report, sections, assignedDimensions: dimensions, allDimensions };
  }

  async assignDimension(reportId: number, dto: { dimensionId: number; role: string; sortOrder?: number }): Promise<MesaReportDimension> {
    const report = await this.findOne(reportId);
    const dimension = await this.dimRepo.findOne({ where: { id: dto.dimensionId } });
    if (!dimension) throw Object.assign(new Error(`Dimension ${dto.dimensionId} not found`), { status: 404 });
    await this.rdRepo.delete({ report: { id: reportId }, dimension: { id: dto.dimensionId } });
    const rd = this.rdRepo.create({ report, dimension, role: dto.role, sortOrder: dto.sortOrder ?? 0 });
    return this.rdRepo.save(rd);
  }

  async setDimensionValueInclusion(reportId: number, dimId: number, includedIds: number[]): Promise<void> {
    const rd = await this.rdRepo.findOne({ where: { report: { id: reportId }, dimension: { id: dimId } } });
    if (!rd) throw Object.assign(new Error(`Dimension ${dimId} not assigned to report ${reportId}`), { status: 404 });
    rd.includedValueIds = includedIds.length > 0 ? JSON.stringify(includedIds) : null;
    await this.rdRepo.save(rd);
  }

  async removeDimension(reportId: number, dimensionId: number): Promise<void> {
    await this.rdRepo.delete({ report: { id: reportId }, dimension: { id: dimensionId } });
  }

  async transition(reportId: number, action: ReportAction, _comment?: string): Promise<MesaReport> {
    const report = await this.findOne(reportId);
    const allowed: Record<string, string[]> = {
      DRAFT: ['SUBMIT'], SUBMITTED: ['APPROVE', 'REJECT'], APPROVED: ['REOPEN'], REJECTED: ['REOPEN'],
    };
    if (!allowed[report.status]?.includes(action)) {
      throw Object.assign(
        new Error(`Azione '${action}' non consentita per stato '${report.status}'`),
        { status: 400 },
      );
    }
    const nextState: Record<string, string> = {
      SUBMIT: 'SUBMITTED', APPROVE: 'APPROVED', REJECT: 'REJECTED', REOPEN: 'DRAFT',
    };
    report.status = nextState[action];
    return this.reportRepo.save(report);
  }
}

export const mesaReportConfigService = new MesaReportConfigService();
