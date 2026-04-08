import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { MesaReport } from './Report';
import { MesaSection } from './Section';
import { MesaKpi } from './Kpi';
import { MesaDimensionValue } from './DimensionValue';
import { MesaUser } from './User';

@Entity('mesa_dc_fact_value')
export class MesaFactValue {
  @PrimaryGeneratedColumn()
  id!: number;

  // Primary owner — cascade on report deletion handles bulk cleanup
  @ManyToOne(() => MesaReport, { onDelete: 'CASCADE' })
  report!: MesaReport;

  // NO ACTION: SQL Server disallows multiple cascade paths (Report→Section→FactValue AND Report→FactValue)
  @ManyToOne(() => MesaSection, { onDelete: 'NO ACTION' })
  section!: MesaSection;

  @ManyToOne(() => MesaKpi, { onDelete: 'NO ACTION' })
  kpi!: MesaKpi;

  @ManyToOne(() => MesaDimensionValue, { onDelete: 'NO ACTION' })
  dimensionValue!: MesaDimensionValue;

  @Column({ type: 'float', nullable: true })
  numericValue!: number | null;

  @ManyToOne(() => MesaUser, { nullable: true, onDelete: 'NO ACTION' })
  updatedBy!: MesaUser;

  @UpdateDateColumn()
  updatedAt!: Date;
}
