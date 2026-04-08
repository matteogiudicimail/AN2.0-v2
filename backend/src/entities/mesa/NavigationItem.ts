import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

@Entity('mesa_admin_navigation_item')
export class MesaNavigationItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  parentId!: number | null;

  @ManyToOne(() => MesaNavigationItem, (n) => n.children, { nullable: true, onDelete: 'NO ACTION' })
  parent!: MesaNavigationItem | null;

  @OneToMany(() => MesaNavigationItem, (n) => n.parent)
  children!: MesaNavigationItem[];

  @Column({ type: 'nvarchar', length: 100 })
  menuKey!: string;

  @Column({ type: 'nvarchar', length: 255 })
  label!: string;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  route!: string | null;

  @Column({ type: 'nvarchar', length: 50, nullable: true })
  icon!: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'nvarchar', length: 50, nullable: true })
  moduleCode!: string | null;
}
