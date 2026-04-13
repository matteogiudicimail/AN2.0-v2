import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MesaKpi } from './Kpi';

@Entity('mesa_md_validation')
export class MesaValidation {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => MesaKpi, { onDelete: 'CASCADE' })
  kpi!: MesaKpi;

  @Column({ length: 30 })
  rule!: string; // NON_NEGATIVE | INTEGER | MIN | MAX | REQUIRED

  @Column({ length: 10, default: 'WARNING' })
  severity!: string; // ERROR | WARNING

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  message!: string;

  @Column({ type: 'float', nullable: true })
  minValue!: number | null;

  @Column({ type: 'float', nullable: true })
  maxValue!: number | null;
}
