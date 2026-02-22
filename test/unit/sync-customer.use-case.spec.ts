import { SyncCustomerUseCase } from '../../src/customer/application/use-cases/sync-customer.use-case';
import { CustomerMergeService } from '../../src/customer/domain/services/customer-merge.service';
import { Customer } from '../../src/customer/domain/entities/customer.entity';
import { CustomerNotFoundException } from '../../src/customer/domain/exceptions/customer-not-found.exception';
import { ICustomerRepository } from '../../src/customer/application/interfaces/customer-repository.interface';
import { SourceSystem } from '../../src/customer/domain/enums/source-system.enum';

describe('SyncCustomerUseCase', () => {
  let useCase: SyncCustomerUseCase;
  let systemA: jest.Mocked<ICustomerRepository>;
  let systemB: jest.Mocked<ICustomerRepository>;
  let mergeService: CustomerMergeService;

  const makeCustomer = (
    overrides: Partial<ConstructorParameters<typeof Customer>[0]> = {},
  ): Customer =>
    new Customer({
      id: 'id-1',
      email: 'sophie@example.de',
      name: 'Sophie Muller',
      address: 'Addr A',
      phone: '+49 111',
      contractStartDate: '2020-01-01',
      contractType: 'basic',
      lastUpdated: new Date('2023-01-01'),
      source: SourceSystem.SYSTEM_A,
      ...overrides,
    });

  beforeEach(() => {
    systemA = {
      findByEmail: jest.fn(),
      searchByName: jest.fn(),
      isHealthy: jest.fn(),
    } as jest.Mocked<ICustomerRepository>;

    systemB = {
      findByEmail: jest.fn(),
      searchByName: jest.fn(),
      isHealthy: jest.fn(),
    } as jest.Mocked<ICustomerRepository>;

    mergeService = new CustomerMergeService();

    useCase = new SyncCustomerUseCase(systemA, systemB, mergeService);
  });

  it('should return conflicts_found when fields differ', async () => {
    const a = makeCustomer({
      name: 'Sophie Muller',
      address: 'Addr A',
      phone: '+49 111',
      lastUpdated: new Date('2023-01-01'),
    });
    const b = makeCustomer({
      id: 'uuid-1',
      name: 'Sophie Mueller',
      address: 'Addr B',
      phone: '+49 222',
      lastUpdated: new Date('2024-06-01'),
      source: SourceSystem.SYSTEM_B,
    });

    systemA.findByEmail.mockResolvedValue(a);
    systemB.findByEmail.mockResolvedValue(b);

    const result = await useCase.execute('sophie@example.de');

    expect(result.status).toBe('conflicts_found');
    expect(result.conflicts.length).toBeGreaterThan(0);
    const conflictFields = result.conflicts.map((c) => c.field);
    expect(conflictFields).toContain('name');
    expect(conflictFields).toContain('address');
    expect(conflictFields).toContain('phone');
  });

  it('should return in_sync when all fields match', async () => {
    const shared = {
      name: 'Max Mustermann',
      address: 'Same Addr',
      phone: '+49 170 1234567',
      contractStartDate: '2020-01-01',
      contractType: 'premium',
    };
    const a = makeCustomer({ ...shared });
    const b = makeCustomer({
      id: 'uuid-1',
      ...shared,
      source: SourceSystem.SYSTEM_B,
    });

    systemA.findByEmail.mockResolvedValue(a);
    systemB.findByEmail.mockResolvedValue(b);

    const result = await useCase.execute('sophie@example.de');

    expect(result.status).toBe('in_sync');
    expect(result.conflicts).toHaveLength(0);
    expect(result.matchedFields).toContain('name');
    expect(result.matchedFields).toContain('address');
  });

  it('should return single_source_only when only in System A', async () => {
    const a = makeCustomer();
    systemA.findByEmail.mockResolvedValue(a);
    systemB.findByEmail.mockResolvedValue(null);

    const result = await useCase.execute('sophie@example.de');

    expect(result.status).toBe('single_source_only');
    expect(result.presentIn).toBe(SourceSystem.SYSTEM_A);
    expect(result.lastUpdated.systemA).toBeDefined();
    expect(result.lastUpdated.systemB).toBeNull();
    expect(result.conflicts).toHaveLength(0);
  });

  it('should return single_source_only when only in System B', async () => {
    const b = makeCustomer({ id: 'uuid-1', source: SourceSystem.SYSTEM_B });
    systemA.findByEmail.mockResolvedValue(null);
    systemB.findByEmail.mockResolvedValue(b);

    const result = await useCase.execute('sophie@example.de');

    expect(result.status).toBe('single_source_only');
    expect(result.presentIn).toBe(SourceSystem.SYSTEM_B);
    expect(result.lastUpdated.systemB).toBeDefined();
    expect(result.lastUpdated.systemA).toBeNull();
  });

  it('should throw CustomerNotFoundException when not found in either', async () => {
    systemA.findByEmail.mockResolvedValue(null);
    systemB.findByEmail.mockResolvedValue(null);

    await expect(useCase.execute('nobody@example.de')).rejects.toThrow(
      CustomerNotFoundException,
    );
  });

  it('should normalize email to lowercase before lookup', async () => {
    systemA.findByEmail.mockResolvedValue(null);
    systemB.findByEmail.mockResolvedValue(null);

    await expect(useCase.execute('  Sophie@Example.DE  ')).rejects.toThrow();

    expect(systemA.findByEmail).toHaveBeenCalledWith('sophie@example.de');
    expect(systemB.findByEmail).toHaveBeenCalledWith('sophie@example.de');
  });
});
