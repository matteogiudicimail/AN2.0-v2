import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MesaReport } from './Report';
import { MesaSection } from './Section';
import { MesaKpi } from './Kpi';
import { MesaUser } from './User';

@Entity('mesa_dc_comment')
export class MesaComment {
  @PrimaryGeneratedColumn()
  id!: number;

  // Primary owner — cascade on report deletion
  @ManyToOne(() => MesaReport, { onDelete: 'CASCADE' })
  report!: MesaReport;

  // NO ACTION: avoids multiple cascade paths from Report
  @ManyToOne(() => MesaSection, { onDelete: 'NO ACTION' })
  section!: MesaSection;

  @ManyToOne(() => MesaKpi, { onDelete: 'NO ACTION' })
  kpi!: MesaKpi;

  @Column({ type: 'int', nullable: true })
  dimensionValueId!: number | null;

  @Column({ type: 'nvarchar', length: 'max' })
  text!: string;

  @ManyToOne(() => MesaUser, { nullable: true, onDelete: 'NO ACTION' })
  author!: MesaUser | null;

  @CreateDateColumn()
  createdAt!: Date;
}
