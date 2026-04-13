import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { MesaDimensionValue } from './DimensionValue';

@Entity('mesa_md_dimension')
export class MesaDimension {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, length: 50 })
  code!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'nvarchar', length: 50, nullable: true })
  type!: string; // entity | time | category

  @OneToMany(() => MesaDimensionValue, (v) => v.dimension)
  values!: MesaDimensionValue[];
}
