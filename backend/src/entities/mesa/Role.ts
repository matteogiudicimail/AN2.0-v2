import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { MesaUserRole } from './UserRole';

@Entity('mesa_sys_role')
export class MesaRole {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, length: 50 })
  code!: string; // ADMIN | COORDINATOR | COMPILER

  @Column({ length: 255 })
  name!: string;

  @OneToMany(() => MesaUserRole, (ur) => ur.role)
  userRoles!: MesaUserRole[];
}
