import { Customer } from '../../domain/entities/customer.entity';

/**
 * Interface defining what use cases need from a customer data source.
 * Both System A (SQLite) and System B (HTTP) implement this.
 *
 * Using abstract class instead of interface because TypeScript interfaces
 * are erased at runtime and cannot serve as NestJS DI tokens.
 */
export abstract class ICustomerRepository {
  abstract findByEmail(email: string): Promise<Customer | null>;
  abstract searchByName(query: string): Promise<Customer[]>;
  abstract isHealthy(): Promise<boolean>;
}
