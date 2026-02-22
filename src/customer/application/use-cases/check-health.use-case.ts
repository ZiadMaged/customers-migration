import { Injectable, Inject } from '@nestjs/common';
import { ICustomerRepository } from '../interfaces/customer-repository.interface';
import { INJECTION_TOKENS } from '../../../shared/constants/injection-tokens';

export interface HealthStatus {
  systemA: boolean;
  systemB: boolean;
}

@Injectable()
export class CheckHealthUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.SYSTEM_A_REPOSITORY)
    private readonly systemA: ICustomerRepository,
    @Inject(INJECTION_TOKENS.SYSTEM_B_REPOSITORY)
    private readonly systemB: ICustomerRepository,
  ) {}

  async execute(): Promise<HealthStatus> {
    const [systemA, systemB] = await Promise.all([
      this.systemA.isHealthy(),
      this.systemB.isHealthy(),
    ]);

    return { systemA, systemB };
  }
}
