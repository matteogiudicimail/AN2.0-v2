import { mesaDataSource } from '../../config/mesaDb';
import { MesaUser } from '../../entities/mesa/User';
import { MesaScope } from '../../entities/mesa/Scope';

export class MesaSecurityService {
  private get users() { return mesaDataSource.getRepository(MesaUser); }
  private get scopes() { return mesaDataSource.getRepository(MesaScope); }

  async findUserById(id: number): Promise<MesaUser> {
    const user = await this.users.findOne({
      where: { id, isActive: true },
      relations: ['userRoles', 'userRoles.role'],
    });
    if (!user) throw Object.assign(new Error(`User ${id} not found`), { status: 404 });
    return user;
  }

  async findUserByUsername(username: string): Promise<MesaUser | null> {
    return this.users.findOne({
      where: { username, isActive: true },
      relations: ['userRoles', 'userRoles.role'],
    });
  }

  async getUserRoles(userId: number): Promise<string[]> {
    const user = await this.findUserById(userId);
    return user.userRoles.map((ur) => ur.role.code);
  }

  async getScopedDimensionValueIds(userId: number): Promise<number[] | null> {
    const userScopes = await this.scopes.find({
      where: { user: { id: userId } },
      relations: ['dimensionValue'],
    });
    if (!userScopes.length) return null; // null = unrestricted (admin)
    return userScopes.map((s) => s.dimensionValue.id);
  }
}

export const mesaSecurityService = new MesaSecurityService();
