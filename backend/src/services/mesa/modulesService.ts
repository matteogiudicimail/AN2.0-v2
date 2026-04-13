import { mesaDataSource } from '../../config/mesaDb';
import { MesaApplicationModule } from '../../entities/mesa/ApplicationModule';

export class MesaModulesService {
  private get repo() { return mesaDataSource.getRepository(MesaApplicationModule); }

  findAll(): Promise<MesaApplicationModule[]> {
    return this.repo.find({ order: { sortOrder: 'ASC', id: 'ASC' } });
  }

  async findOne(id: number): Promise<MesaApplicationModule> {
    const m = await this.repo.findOne({ where: { id } });
    if (!m) throw Object.assign(new Error(`Modulo ${id} non trovato`), { status: 404 });
    return m;
  }

  async create(dto: Partial<MesaApplicationModule>): Promise<MesaApplicationModule> {
    if (dto.code) {
      const exists = await this.repo.findOne({ where: { code: dto.code } });
      if (exists) throw Object.assign(new Error(`Codice "${dto.code}" già in uso`), { status: 409 });
    }
    const mod = this.repo.create({
      code: dto.code ?? '',
      name: dto.name ?? '',
      description: dto.description ?? null,
      moduleType: dto.moduleType ?? 'capability',
      icon: dto.icon ?? null,
      color: dto.color ?? null,
      sortOrder: dto.sortOrder ?? 0,
      version: dto.version ?? '1.0.0',
      isActive: dto.isActive ?? true,
    });
    return this.repo.save(mod);
  }

  async update(id: number, dto: Partial<MesaApplicationModule>): Promise<MesaApplicationModule> {
    const mod = await this.findOne(id);
    if (dto.code !== undefined && dto.code !== mod.code) {
      const exists = await this.repo.findOne({ where: { code: dto.code } });
      if (exists) throw Object.assign(new Error(`Codice "${dto.code}" già in uso`), { status: 409 });
    }
    Object.assign(mod, dto);
    return this.repo.save(mod);
  }

  async remove(id: number): Promise<{ deleted: number }> {
    const mod = await this.findOne(id);
    await this.repo.remove(mod);
    return { deleted: id };
  }
}

export const mesaModulesService = new MesaModulesService();
