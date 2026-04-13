import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { MesaSection } from './Section';

@Entity('mesa_md_kpi')
export class MesaKpi {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => MesaSection, (s) => s.kpis, { onDelete: 'CASCADE' })
  section!: MesaSection;

  @ManyToOne(() => MesaKpi, (k) => k.children, { nullable: true, onDelete: 'NO ACTION' })
  parent!: MesaKpi | null;

  @OneToMany(() => MesaKpi, (k) => k.parent)
  children!: MesaKpi[];

  @Column({ length: 255 })
  name!: string;

  @Column({ length: 50, default: 'n°' })
  unit!: string;

  @Column({ type: 'nvarchar', length: 50, nullable: true })
  subSection!: string;

  @Column({ default: false })
  isCalculated!: boolean;

  @Column({ type: 'nvarchar', length: 20, nullable: true })
  formulaType!: string | null; // SUM | AVG | RATIO

  @Column({ type: 'int', nullable: true })
  formulaOperandCount!: number | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ default: false })
  isBold!: boolean;

  @Column({ type: 'int', default: 0 })
  indentLevel!: number;

  @Column({ default: true })
  isEnabled!: boolean;
}
