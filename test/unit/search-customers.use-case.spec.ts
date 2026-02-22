import { SearchCustomersUseCase } from '../../src/customer/application/use-cases/search-customers.use-case';
import { CustomerMergeService } from '../../src/customer/domain/services/customer-merge.service';
import { Customer } from '../../src/customer/domain/entities/customer.entity';
import { ICustomerRepository } from '../../src/customer/application/interfaces/customer-repository.interface';
import { SourceSystem } from '../../src/customer/domain/enums/source-system.enum';

describe('SearchCustomersUseCase', () => {
  let useCase: SearchCustomersUseCase;
  let systemA: jest.Mocked<ICustomerRepository>;
  let systemB: jest.Mocked<ICustomerRepository>;
  let mergeService: CustomerMergeService;

  const makeCustomer = (
    overrides: Partial<ConstructorParameters<typeof Customer>[0]> = {},
  ): Customer =>
    new Customer({
      id: 'id-1',
      email: 'test@example.de',
      name: 'Test User',
      address: 'Test Addr',
      lastUpdated: new Date('2024-01-01'),
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

    useCase = new SearchCustomersUseCase(systemA, systemB, mergeService);
  });

  it('should deduplicate by email and merge matching records', async () => {
    const a = makeCustomer({ email: 'max@example.de', name: 'Max Mustermann' });
    const b = makeCustomer({
      id: 'uuid-1',
      email: 'max@example.de',
      name: 'Max Mustermann',
      address: 'New Addr',
      source: SourceSystem.SYSTEM_B,
    });

    systemA.searchByName.mockResolvedValue([a]);
    systemB.searchByName.mockResolvedValue([b]);
    // Cross-ref: system A already has the email, system B already has the email
    systemA.findByEmail.mockResolvedValue(a);
    systemB.findByEmail.mockResolvedValue(b);

    const results = await useCase.execute('Max');

    expect(results).toHaveLength(1);
    expect(results[0]._metadata.sources).toEqual([
      SourceSystem.SYSTEM_A,
      SourceSystem.SYSTEM_B,
    ]);
    expect(results[0].address).toBe('New Addr'); // System B wins
  });

  it('should cross-reference when result found in only one system', async () => {
    const bOnly = makeCustomer({
      id: 'uuid-1',
      email: 'sophie@example.de',
      name: 'Sophie Mueller',
      phone: '+49 170 9999999',
      source: SourceSystem.SYSTEM_B,
    });
    const aMatch = makeCustomer({
      id: 'id-2',
      email: 'sophie@example.de',
      name: 'Sophie Muller',
      contractStartDate: '2022-01-01',
      contractType: 'basic',
      source: SourceSystem.SYSTEM_A,
    });

    // Name search: System A returns nothing (query "Mueller" doesn't match "Muller")
    systemA.searchByName.mockResolvedValue([]);
    systemB.searchByName.mockResolvedValue([bOnly]);

    // Cross-reference lookup: System A contains Sophie by email
    systemA.findByEmail.mockResolvedValue(aMatch);
    systemB.findByEmail.mockResolvedValue(bOnly);

    const results = await useCase.execute('Mueller');

    expect(results).toHaveLength(1);
    // Should be merged from both systems via cross-reference
    expect(results[0]._metadata.sources).toEqual([
      SourceSystem.SYSTEM_A,
      SourceSystem.SYSTEM_B,
    ]);
    expect(results[0].contractStartDate).toBe('2022-01-01'); // from System A
    expect(results[0].phone).toBe('+49 170 9999999'); // from System B
  });

  it('should return multiple distinct customers', async () => {
    const a1 = makeCustomer({
      email: 'max@example.de',
      name: 'Max Mustermann',
    });
    const b1 = makeCustomer({
      id: 'uuid-1',
      email: 'anna@example.de',
      name: 'Anna Mustermann',
      source: SourceSystem.SYSTEM_B,
    });

    systemA.searchByName.mockResolvedValue([a1]);
    systemB.searchByName.mockResolvedValue([b1]);
    // Cross-ref lookups
    systemA.findByEmail.mockResolvedValue(null);
    systemB.findByEmail.mockResolvedValue(null);

    const results = await useCase.execute('Mustermann');

    expect(results).toHaveLength(2);
    const emails = results.map((r) => r.email);
    expect(emails).toContain('max@example.de');
    expect(emails).toContain('anna@example.de');
  });

  it('should mark results as partial when System B returns no data', async () => {
    const a = makeCustomer({ email: 'max@example.de', name: 'Max Mustermann' });
    systemA.searchByName.mockResolvedValue([a]);
    systemB.searchByName.mockResolvedValue([]);
    // Cross-ref: System B has no match for this email either
    systemA.findByEmail.mockResolvedValue(a);
    systemB.findByEmail.mockResolvedValue(null);

    const results = await useCase.execute('Max');

    expect(results).toHaveLength(1);
    expect(results[0]._metadata.isPartial).toBe(true);
    expect(results[0]._metadata.sources).toEqual([SourceSystem.SYSTEM_A]);
  });

  it('should return empty array when no results in either system', async () => {
    systemA.searchByName.mockResolvedValue([]);
    systemB.searchByName.mockResolvedValue([]);

    const results = await useCase.execute('nonexistent');

    expect(results).toEqual([]);
  });

  it('should still return System A results when System B has no matches', async () => {
    const a = makeCustomer({ email: 'max@example.de', name: 'Max M.' });
    systemA.searchByName.mockResolvedValue([a]);
    systemB.searchByName.mockResolvedValue([]);
    // Cross-ref: System B has no match
    systemA.findByEmail.mockResolvedValue(a);
    systemB.findByEmail.mockResolvedValue(null);

    const results = await useCase.execute('Max');

    expect(results).toHaveLength(1);
    expect(results[0].email).toBe('max@example.de');
  });
});
