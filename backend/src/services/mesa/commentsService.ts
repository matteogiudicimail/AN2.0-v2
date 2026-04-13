import { mesaDataSource } from '../../config/mesaDb';
import { MesaComment } from '../../entities/mesa/Comment';

export class MesaCommentsService {
  private get repo() { return mesaDataSource.getRepository(MesaComment); }

  async list(reportId: number, sectionId: number, kpiId: number, dimensionValueId?: number): Promise<MesaComment[]> {
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.author', 'u')
      .where('c.report = :reportId', { reportId })
      .andWhere('c.section = :sectionId', { sectionId })
      .andWhere('c.kpi = :kpiId', { kpiId })
      .orderBy('c.createdAt', 'ASC');

    if (dimensionValueId !== undefined) {
      qb.andWhere('c.dimensionValueId = :dvId', { dvId: dimensionValueId });
    }
    return qb.getMany();
  }

  async create(reportId: number, sectionId: number, dto: { kpiId: number; dimensionValueId?: number; text: string }, userId: number): Promise<MesaComment> {
    const comment = this.repo.create({
      report: { id: reportId } as any,
      section: { id: sectionId } as any,
      kpi: { id: dto.kpiId } as any,
      dimensionValueId: dto.dimensionValueId ?? null,
      text: dto.text,
      author: { id: userId } as any,
    });
    return this.repo.save(comment);
  }

  async delete(id: number, userId: number): Promise<void> {
    const comment = await this.repo.findOne({ where: { id }, relations: ['author'] });
    if (!comment) throw Object.assign(new Error(`Comment ${id} not found`), { status: 404 });
    if ((comment.author as any)?.id !== userId) {
      throw Object.assign(new Error('Non autorizzato'), { status: 403 });
    }
    await this.repo.remove(comment);
  }

  async getKpiIdsWithComments(reportId: number, sectionId: number): Promise<Set<number>> {
    const rows = await this.repo
      .createQueryBuilder('c')
      .select('DISTINCT c.kpiId', 'kpiId')
      .where('c.report = :reportId', { reportId })
      .andWhere('c.section = :sectionId', { sectionId })
      .getRawMany() as { kpiId: number }[];
    return new Set(rows.map((r) => r.kpiId));
  }
}

export const mesaCommentsService = new MesaCommentsService();
