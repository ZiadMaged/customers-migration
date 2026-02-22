import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('customers_a')
export class CustomerAEntity {
  @PrimaryColumn()
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  name!: string;

  @Column()
  address!: string;

  @Column({ name: 'contract_start_date', nullable: true })
  contractStartDate!: string;

  @Column({ name: 'contract_type', nullable: true })
  contractType!: string;

  @Column({ name: 'last_updated' })
  lastUpdated!: string;
}
