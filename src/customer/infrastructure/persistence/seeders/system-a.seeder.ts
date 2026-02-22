import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerAEntity } from '../entities/customer-a.orm-entity';

const SEED_DATA: Partial<CustomerAEntity>[] = [
  {
    id: 'legacy_001',
    email: 'max.mustermann@example.de',
    name: 'Max Mustermann',
    address: 'Sonnenallee 1, 12345 Berlin',
    contractStartDate: '2021-03-15',
    contractType: 'RENTAL',
    lastUpdated: '2024-11-01T10:00:00Z',
  },
  {
    id: 'legacy_002',
    email: 'erika.muster@example.de',
    name: 'Erika Musterfrau',
    address: 'Hauptstr. 42, 10115 Berlin',
    contractStartDate: '2022-07-01',
    contractType: 'PURCHASE',
    lastUpdated: '2024-08-15T14:30:00Z',
  },
  {
    id: 'legacy_003',
    email: 'jan.schmidt@example.de',
    name: 'Jan Schmidt',
    address: 'Berliner Str. 10, 80331 Munich',
    contractStartDate: '2023-01-10',
    contractType: 'RENTAL',
    lastUpdated: '2024-06-20T09:00:00Z',
  },
  {
    id: 'legacy_004',
    email: 'sophie.mueller@example.de',
    name: 'Sophie Muller',
    address: 'Kastanienallee 7, 10435 Berlin',
    contractStartDate: '2023-09-01',
    contractType: 'RENTAL',
    lastUpdated: '2024-10-05T16:00:00Z',
  },
];

@Injectable()
export class SystemASeeder implements OnModuleInit {
  private readonly logger = new Logger(SystemASeeder.name);

  constructor(
    @InjectRepository(CustomerAEntity)
    private readonly repo: Repository<CustomerAEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.repo.count();
    if (count > 0) {
      this.logger.log(
        `System A already seeded with ${count} records, skipping`,
      );
      return;
    }

    this.logger.log('Seeding System A with initial data...');
    await this.repo.save(SEED_DATA as CustomerAEntity[]);
    this.logger.log(`System A seeded with ${SEED_DATA.length} records`);
  }
}
