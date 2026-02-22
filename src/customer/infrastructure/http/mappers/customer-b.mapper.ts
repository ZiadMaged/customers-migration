import { Customer } from '../../../domain/entities/customer.entity';
import { SourceSystem } from '../../../domain/enums/source-system.enum';

export interface SystemBApiResponse {
  uuid: string;
  email: string;
  name: string;
  phone: string;
  address: string;
  last_updated: string;
}

export class CustomerBMapper {
  static toDomain(data: SystemBApiResponse): Customer {
    return new Customer({
      id: data.uuid,
      email: data.email,
      name: data.name,
      address: data.address,
      phone: data.phone,
      lastUpdated: new Date(data.last_updated),
      source: SourceSystem.SYSTEM_B,
    });
  }
}
