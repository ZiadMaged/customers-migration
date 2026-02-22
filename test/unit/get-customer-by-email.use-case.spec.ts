import { GetCustomerByEmailUseCase } from '../../src/customer/application/use-cases/get-customer-by-email.use-case';
import { CustomerMergeService } from '../../src/customer/domain/services/customer-merge.service';
import { Customer } from '../../src/customer/domain/entities/customer.entity';
import { CustomerNotFoundException } from '../../src/customer/domain/exceptions/customer-not-found.exception';
import { ICustomerRepository } from '../../src/customer/application/interfaces/customer-repository.interface';
import { SourceSystem } from '../../src/customer/domain/enums/source-system.enum';

describe('GetCustomerByEmailUseCase', () => {
  let useCase: GetCustomerByEmailUseCase;
  let systemA: jest.Mocked<ICustomerRepository>;
  let systemB: jest.Mocked<ICustomerRepository>;
  let mergeService: CustomerMergeService;

  const customerA = new Customer({
    id: '1',
    email: 'max@example.de',
    name: 'Max Mustermann',
    address: 'Musterstr. 1',
    phone: null,
    contractStartDate: '2020-01-01',
    contractType: 'premium',
    lastUpdated: new Date('2023-01-01'),
    source: SourceSystem.SYSTEM_A,
  });

  const customerB = new Customer({
    id: 'uuid-1',
    email: 'max@example.de',
    name: 'Max Mustermann',
    address: 'Musterstr. 1a',
    phone: '+49 170 1234567',
    contractStartDate: null,
    contractType: null,
    lastUpdated: new Date('2024-01-01'),
    source: SourceSystem.SYSTEM_B,
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

    useCase = new GetCustomerByEmailUseCase(systemA, systemB, mergeService);
  });

  it('should merge records from both systems', async () => {
    systemA.findByEmail.mockResolvedValue(customerA);
    systemB.findByEmail.mockResolvedValue(customerB);

    const result = await useCase.execute('Max@Example.DE');

    expect(systemA.findByEmail).toHaveBeenCalledWith('max@example.de');
    expect(systemB.findByEmail).toHaveBeenCalledWith('max@example.de');
    expect(result._metadata.sources).toEqual([
      SourceSystem.SYSTEM_A,
      SourceSystem.SYSTEM_B,
    ]);
    expect(result._metadata.isPartial).toBe(false);
    expect(result.address).toBe('Musterstr. 1a'); // System B wins
    expect(result.contractType).toBe('premium'); // System A wins
  });

  it('should return partial result when System B returns null', async () => {
    systemA.findByEmail.mockResolvedValue(customerA);
    systemB.findByEmail.mockResolvedValue(null);

    const result = await useCase.execute('max@example.de');

    expect(result._metadata.isPartial).toBe(true);
    expect(result._metadata.sources).toEqual([SourceSystem.SYSTEM_A]);
    expect(result.identifiers.systemAId).toBe('1');
    expect(result.identifiers.systemBUuid).toBeNull();
  });

  it('should return partial result when System A returns null', async () => {
    systemA.findByEmail.mockResolvedValue(null);
    systemB.findByEmail.mockResolvedValue(customerB);

    const result = await useCase.execute('max@example.de');

    expect(result._metadata.isPartial).toBe(true);
    expect(result._metadata.sources).toEqual([SourceSystem.SYSTEM_B]);
    expect(result.identifiers.systemBUuid).toBe('uuid-1');
  });

  it('should return non-partial when both systems have data', async () => {
    systemA.findByEmail.mockResolvedValue(customerA);
    systemB.findByEmail.mockResolvedValue(customerB);

    const result = await useCase.execute('max@example.de');

    expect(result._metadata.sources).toEqual([
      SourceSystem.SYSTEM_A,
      SourceSystem.SYSTEM_B,
    ]);
    expect(result._metadata.isPartial).toBe(false);
  });

  it('should throw CustomerNotFoundException when not found in either system', async () => {
    systemA.findByEmail.mockResolvedValue(null);
    systemB.findByEmail.mockResolvedValue(null);

    await expect(useCase.execute('notfound@example.de')).rejects.toThrow(
      CustomerNotFoundException,
    );
  });
});
