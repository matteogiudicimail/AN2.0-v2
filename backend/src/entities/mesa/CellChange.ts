import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MesaFactValue } from './FactValue';
import { MesaUser } from './User';

@Entity('mesa_aud_cell_change')
export class MesaCellChange {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => MesaFactValue, { onDelete: 'CASCADE', eager: false })
  factValue!: MesaFactValue;

  @ManyToOne(() => MesaUser, { nullable: true, onDelete: 'NO ACTION' })
  user!: MesaUser | null;

  @Column({ type: 'nvarchar', length: 'max', nullable: true })
  oldValue!: string | null;

  @Column({ type: 'nvarchar', length: 'max', nullable: true })
  newValue!: string | null;

  @Column({ length: 30, default: 'MANUAL' })
  source!: string; // MANUAL | EXCEL | API

  @CreateDateColumn()
  changedAt!: Date;
}
