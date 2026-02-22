import { Customer } from '../../../domain/entities/customer.entity';
import { SourceSystem } from '../../../domain/enums/source-system.enum';
import { CustomerAEntity } from '../entities/customer-a.orm-entity';

export class CustomerAMapper {
  static toDomain(orm: CustomerAEntity): Customer {
    return new Customer({
      id: orm.id,
      email: orm.email,
      name: orm.name,
      address: orm.address,
      contractStartDate: orm.contractStartDate,
      contractType: orm.contractType,
      lastUpdated: new Date(orm.lastUpdated),
      source: SourceSystem.SYSTEM_A,
    });
  }

  static toOrm(domain: Customer): CustomerAEntity {
    const orm = new CustomerAEntity();
    orm.id = domain.id;
    orm.email = domain.email;
    orm.name = domain.name;
    orm.address = domain.address;
    orm.contractStartDate = domain.contractStartDate ?? '';
    orm.contractType = domain.contractType ?? '';
    orm.lastUpdated = domain.lastUpdated.toISOString();
    return orm;
  }
}
