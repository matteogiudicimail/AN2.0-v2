import { mesaDataSource } from '../../config/mesaDb';
import { MesaUser } from '../../entities/mesa/User';
import { MesaRole } from '../../entities/mesa/Role';
import { MesaUserRole } from '../../entities/mesa/UserRole';

interface UpsertUserDto {
  username: string;
  displayName: string;
  initials?: string;
  email?: string;
  password?: string;
  isActive?: boolean;
  roles?: string[];
}

export class MesaUsersService {
  private get users() { return mesaDataSource.getRepository(MesaUser); }
  private get roles() { return mesaDataSource.getRepository(MesaRole); }
  private get userRoles() { return mesaDataSource.getRepository(MesaUserRole); }

  findAllRoles(): Promise<MesaRole[]> {
    return this.roles.find({ order: { code: 'ASC' } });
  }

  async findAll() {
    const list = await this.users.find({ relations: ['userRoles', 'userRoles.role'] });
    return list.map((u) => this.map(u));
  }

  async findOne(id: number) {
    const u = await this.users.findOne({ where: { id }, relations: ['userRoles', 'userRoles.role'] });
    if (!u) throw Object.assign(new Error(`Utente ${id} non trovato`), { status: 404 });
    return this.map(u);
  }

  async create(dto: UpsertUserDto) {
    const existing = await this.users.findOne({ where: { username: dto.username } });
    if (existing) throw Object.assign(new Error(`Username "${dto.username}" già in uso`), { status: 409 });

    const user = this.users.create({
      username: dto.username,
      displayName: dto.displayName,
      initials: dto.initials ?? this.buildInitials(dto.displayName),
      email: dto.email,
      passwordHash: dto.password ?? 'mesa2025',
      isActive: dto.isActive ?? true,
    });
    const saved = await this.users.save(user);
    await this.syncRoles(saved, dto.roles ?? []);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: Partial<UpsertUserDto>) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw Object.assign(new Error(`Utente ${id} non trovato`), { status: 404 });
    if (dto.displayName) user.displayName = dto.displayName;
    if (dto.initials)    user.initials    = dto.initials;
    if (dto.email)       user.email       = dto.email as string;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.password)    user.passwordHash = dto.password;
    await this.users.save(user);
    if (dto.roles) await this.syncRoles(user, dto.roles);
    return this.findOne(id);
  }

  async remove(id: number): Promise<{ deleted: number }> {
    const user = await this.users.findOne({ where: { id }, relations: ['userRoles'] });
    if (!user) throw Object.assign(new Error(`Utente ${id} non trovato`), { status: 404 });
    if (user.userRoles?.length) await this.userRoles.remove(user.userRoles);
    await this.users.remove(user);
    return { deleted: id };
  }

  private async syncRoles(user: MesaUser, roleCodes: string[]): Promise<void> {
    const existing = await this.userRoles.find({ where: { user: { id: user.id } } });
    if (existing.length) await this.userRoles.remove(existing);
    for (const code of roleCodes) {
      const role = await this.roles.findOne({ where: { code } });
      if (role) {
        const ur = this.userRoles.create();
        ur.user = user;
        ur.role = role;
        await this.userRoles.save(ur);
      }
    }
  }

  private buildInitials(name: string): string {
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  }

  private map(u: MesaUser) {
    return {
      id: u.id, username: u.username, displayName: u.displayName,
      initials: u.initials, email: u.email, isActive: u.isActive,
      roles: u.userRoles?.map((ur) => ur.role?.code).filter(Boolean) ?? [],
    };
  }
}

export const mesaUsersService = new MesaUsersService();
