import { EntityManager } from 'typeorm';
import { mesaDataSource } from '../../config/mesaDb';
import { MesaCellChange } from '../../entities/mesa/CellChange';

interface RecordParams {
  factValueId: number; userId: number;
  oldValue: string | null; newValue: string | null; source: string;
}

export class MesaAuditService {
  private get changeRepo() { return mesaDataSource.getRepository(MesaCellChange); }

  async record(em: EntityManager, params: RecordParams): Promise<void> {
    if (params.oldValue === params.newValue) return;
    const change = em.create(MesaCellChange);
    (change as any).factValue = { id: params.factValueId };
    (change as any).user = params.userId ? { id: params.userId } : null;
    change.oldValue = params.oldValue;
    change.newValue = params.newValue;
    change.source = params.source;
    await em.save(change);
  }

  async findChanges(params: {
    reportId?: number; sectionId?: number;
    from?: string; to?: string; userId?: number;
    page?: number; limit?: number;
  }) {
    const qb = this.changeRepo
      .createQueryBuilder('ch')
      .leftJoinAndSelect('ch.factValue', 'fv')
      .leftJoinAndSelect('ch.user', 'u')
      .leftJoinAndSelect('fv.kpi', 'kpi')
      .leftJoinAndSelect('fv.dimensionValue', 'dv')
      .leftJoinAndSelect('fv.section', 'sec')
      .leftJoinAndSelect('fv.report', 'rep')
      .orderBy('ch.changedAt', 'DESC');

    if (params.reportId)  qb.andWhere('rep.id = :reportId',   { reportId: params.reportId });
    if (params.sectionId) qb.andWhere('sec.id = :sectionId', { sectionId: params.sectionId });
    if (params.from)      qb.andWhere('ch.changedAt >= :from', { from: params.from });
    if (params.to)        qb.andWhere('ch.changedAt <= :to',   { to: params.to });
    if (params.userId)    qb.andWhere('u.id = :userId',        { userId: params.userId });

    const page  = params.page ?? 1;
    const limit = Math.min(params.limit ?? 50, 200);
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      total, page, limit,
      items: items.map((ch) => ({
        id: ch.id,
        factValueId: (ch.factValue as any)?.id,
        userId: (ch.user as any)?.id,
        userDisplayName: (ch.user as any)?.displayName,
        kpiName: (ch.factValue as any)?.kpi?.name,
        sectionName: (ch.factValue as any)?.section?.name,
        dimensionValueCode: (ch.factValue as any)?.dimensionValue?.code,
        oldValue: ch.oldValue, newValue: ch.newValue,
        source: ch.source, changedAt: ch.changedAt,
      })),
    };
  }
}

export const mesaAuditService = new MesaAuditService();
