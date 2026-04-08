import { mesaDataSource } from '../../config/mesaDb';
import { MesaNavigationItem } from '../../entities/mesa/NavigationItem';
import { MesaApplicationModule } from '../../entities/mesa/ApplicationModule';

export class MesaNavigationService {
  private get nav() { return mesaDataSource.getRepository(MesaNavigationItem); }
  private get mods() { return mesaDataSource.getRepository(MesaApplicationModule); }

  findAll(): Promise<MesaNavigationItem[]> {
    return this.nav.find({ order: { sortOrder: 'ASC', id: 'ASC' } });
  }

  async getTree(): Promise<(MesaNavigationItem & { children: MesaNavigationItem[] })[]> {
    const all = await this.nav.find({ order: { sortOrder: 'ASC', id: 'ASC' } });
    const map = new Map<number, MesaNavigationItem & { children: MesaNavigationItem[] }>();
    all.forEach((item) => map.set(item.id, { ...item, children: [] }));

    const roots: (MesaNavigationItem & { children: MesaNavigationItem[] })[] = [];
    map.forEach((item) => {
      if (item.parentId && map.has(item.parentId)) {
        map.get(item.parentId)!.children.push(item);
      } else {
        roots.push(item);
      }
    });
    return roots;
  }

  getModules(): Promise<MesaApplicationModule[]> {
    return this.mods.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
  }

  async create(dto: {
    menuKey: string; label: string; route?: string | null; icon?: string | null;
    sortOrder?: number; isActive?: boolean; parentId?: number | null; moduleCode?: string | null;
  }): Promise<MesaNavigationItem> {
    const item = this.nav.create({
      menuKey: dto.menuKey,
      label: dto.label,
      route: dto.route ?? null,
      icon: dto.icon ?? null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      parentId: dto.parentId ?? null,
      moduleCode: dto.moduleCode ?? null,
    });
    return this.nav.save(item);
  }

  async update(id: number, dto: Partial<{
    label: string; route: string | null; icon: string | null;
    sortOrder: number; isActive: boolean; parentId: number | null; moduleCode: string | null;
  }>): Promise<MesaNavigationItem> {
    const item = await this.nav.findOne({ where: { id } });
    if (!item) throw Object.assign(new Error(`Nav item ${id} non trovato`), { status: 404 });
    Object.assign(item, dto);
    return this.nav.save(item);
  }

  async remove(id: number): Promise<{ deleted: number }> {
    const item = await this.nav.findOneOrFail({ where: { id } });
    await this.nav.remove(item);
    return { deleted: id };
  }

  async reorder(items: Array<{ id: number; sortOrder: number; parentId: number | null }>): Promise<void> {
    for (const { id, sortOrder, parentId } of items) {
      await this.nav.update(id, { sortOrder, parentId: parentId ?? undefined });
    }
  }
}

export const mesaNavigationService = new MesaNavigationService();
