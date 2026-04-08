import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MesaReport } from './Report';
import { MesaDimension } from './Dimension';

@Entity('mesa_cfg_report_dimension')
export class MesaReportDimension {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => MesaReport, { onDelete: 'CASCADE' })
  report!: MesaReport;

  @ManyToOne(() => MesaDimension, (d) => d.values, { eager: true })
  dimension!: MesaDimension;

  @Column({ length: 20, default: 'COLUMN' })
  role!: string; // COLUMN | ROW | FILTER | SECTION

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'nvarchar', length: 'max', nullable: true })
  includedValueIds!: string | null; // JSON array of DimensionValue IDs
}
