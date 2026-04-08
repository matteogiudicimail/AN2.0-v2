import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { MesaReport } from './Report';
import { MesaKpi } from './Kpi';

@Entity('mesa_md_section')
export class MesaSection {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => MesaReport, (r) => r.sections, { onDelete: 'CASCADE' })
  report!: MesaReport;

  @Column({ length: 50 })
  code!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ length: 30, default: 'EMPTY' })
  status!: string; // EMPTY | INCOMPLETE | COMPLETE

  @OneToMany(() => MesaKpi, (k) => k.section)
  kpis!: MesaKpi[];
}
