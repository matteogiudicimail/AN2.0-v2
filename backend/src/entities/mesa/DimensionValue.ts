import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MesaDimension } from './Dimension';

@Entity('mesa_md_dimension_value')
export class MesaDimensionValue {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => MesaDimension, (d) => d.values, { onDelete: 'CASCADE' })
  dimension!: MesaDimension;

  @Column({ length: 50 })
  code!: string;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  name!: string;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;
}
