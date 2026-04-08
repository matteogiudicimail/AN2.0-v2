import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('mesa_admin_application_module')
export class MesaApplicationModule {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 50, unique: true })
  code!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'nvarchar', length: 'max', nullable: true })
  description!: string | null;

  @Column({ length: 30, default: 'capability' })
  moduleType!: string;

  @Column({ type: 'nvarchar', length: 50, nullable: true })
  icon!: string | null;

  @Column({ type: 'nvarchar', length: 20, nullable: true })
  color!: string | null;

  @Column({ default: 0 })
  sortOrder!: number;

  @Column({ length: 20, default: '1.0.0' })
  version!: string;

  @Column({ default: true })
  isActive!: boolean;
}
