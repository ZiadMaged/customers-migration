import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ICustomerRepository } from '../../../application/interfaces/customer-repository.interface';
import { Customer } from '../../../domain/entities/customer.entity';
import { CustomerAEntity } from '../entities/customer-a.orm-entity';
import { CustomerAMapper } from '../mappers/customer-a.mapper';

@Injectable()
export class SystemARepository implements ICustomerRepository {
  private readonly logger = new Logger(SystemARepository.name);

  constructor(
    @InjectRepository(CustomerAEntity)
    private readonly repo: Repository<CustomerAEntity>,
  ) {}

  async findByEmail(email: string): Promise<Customer | null> {
    const entity = await this.repo.findOne({
      where: { email: email.toLowerCase().trim() },
    });

    if (!entity) {
      this.logger.debug(`System A: No customer found for email ${email}`);
      return null;
    }

    this.logger.debug(
      `System A: Found customer ${entity.id} for email ${email}`,
    );
    return CustomerAMapper.toDomain(entity);
  }

  async searchByName(query: string): Promise<Customer[]> {
    const entities = await this.repo
      .createQueryBuilder('c')
      .where('LOWER(c.name) LIKE LOWER(:query)', {
        query: `%${query}%`,
      })
      .getMany();

    this.logger.debug(
      `System A: Found ${entities.length} customers matching "${query}"`,
    );
    return entities.map((e) => CustomerAMapper.toDomain(e));
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.repo.query('SELECT 1');
      return true;
    } catch (error) {
      this.logger.error('System A health check failed', error);
      return false;
    }
  }
}
