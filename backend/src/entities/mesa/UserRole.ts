import { Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MesaUser } from './User';
import { MesaRole } from './Role';

@Entity('mesa_sys_user_role')
export class MesaUserRole {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => MesaUser, (u) => u.userRoles, { onDelete: 'CASCADE' })
  user!: MesaUser;

  @ManyToOne(() => MesaRole, (r) => r.userRoles, { eager: true, onDelete: 'CASCADE' })
  role!: MesaRole;
}
