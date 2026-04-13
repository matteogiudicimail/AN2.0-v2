import { Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MesaUser } from './User';
import { MesaDimensionValue } from './DimensionValue';

@Entity('mesa_sys_scope')
export class MesaScope {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => MesaUser, (u) => u.scopes, { onDelete: 'CASCADE' })
  user!: MesaUser;

  @ManyToOne(() => MesaDimensionValue, { onDelete: 'CASCADE' })
  dimensionValue!: MesaDimensionValue;
}
