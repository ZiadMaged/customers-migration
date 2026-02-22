import { CheckHealthUseCase } from '../../src/customer/application/use-cases/check-health.use-case';
import { ICustomerRepository } from '../../src/customer/application/interfaces/customer-repository.interface';

describe('CheckHealthUseCase', () => {
  let useCase: CheckHealthUseCase;
  let systemA: jest.Mocked<ICustomerRepository>;
  let systemB: jest.Mocked<ICustomerRepository>;

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

    useCase = new CheckHealthUseCase(systemA, systemB);
  });

  it('should return both systems healthy when both respond true', async () => {
    systemA.isHealthy.mockResolvedValue(true);
    systemB.isHealthy.mockResolvedValue(true);

    const result = await useCase.execute();

    expect(result).toEqual({ systemA: true, systemB: true });
    expect(systemA.isHealthy).toHaveBeenCalledTimes(1);
    expect(systemB.isHealthy).toHaveBeenCalledTimes(1);
  });

  it('should return system A down when it responds false', async () => {
    systemA.isHealthy.mockResolvedValue(false);
    systemB.isHealthy.mockResolvedValue(true);

    const result = await useCase.execute();

    expect(result).toEqual({ systemA: false, systemB: true });
  });

  it('should return system B down when it responds false', async () => {
    systemA.isHealthy.mockResolvedValue(true);
    systemB.isHealthy.mockResolvedValue(false);

    const result = await useCase.execute();

    expect(result).toEqual({ systemA: true, systemB: false });
  });

  it('should return both systems down when both respond false', async () => {
    systemA.isHealthy.mockResolvedValue(false);
    systemB.isHealthy.mockResolvedValue(false);

    const result = await useCase.execute();

    expect(result).toEqual({ systemA: false, systemB: false });
  });

  it('should call both health checks in parallel', async () => {
    const order: string[] = [];

    systemA.isHealthy.mockImplementation(async () => {
      order.push('a-start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('a-end');
      return true;
    });

    systemB.isHealthy.mockImplementation(async () => {
      order.push('b-start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('b-end');
      return true;
    });

    await useCase.execute();

    // Both should start before either finishes (parallel execution)
    expect(order.indexOf('b-start')).toBeLessThan(order.indexOf('a-end'));
  });
});
