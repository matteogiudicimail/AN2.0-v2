import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { MesaUserRole } from './UserRole';
import { MesaScope } from './Scope';

@Entity('mesa_sys_user')
export class MesaUser {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, length: 100 })
  username!: string;

  @Column({ length: 255 })
  displayName!: string;

  @Column({ type: 'nvarchar', length: 5, nullable: true })
  initials!: string;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  email!: string;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  passwordHash!: string;

  @Column({ default: true })
  isActive!: boolean;

  @OneToMany(() => MesaUserRole, (ur) => ur.user, { eager: true })
  userRoles!: MesaUserRole[];

  @OneToMany(() => MesaScope, (s) => s.user)
  scopes!: MesaScope[];
}
