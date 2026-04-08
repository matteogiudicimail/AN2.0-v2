import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { MesaSection } from './Section';

@Entity('mesa_cfg_report')
export class MesaReport {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, length: 50 })
  code!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'nvarchar', length: 'max', nullable: true })
  description!: string | null;

  @Column({ type: 'nvarchar', length: 50, nullable: true })
  period!: string;

  @Column({ length: 30, default: 'DRAFT' })
  status!: string; // DRAFT | SUBMITTED | APPROVED | REJECTED

  @OneToMany(() => MesaSection, (s) => s.report)
  sections!: MesaSection[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
