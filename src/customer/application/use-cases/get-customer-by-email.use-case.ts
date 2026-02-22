import { Injectable, Inject, Logger } from '@nestjs/common';
import { ICustomerRepository } from '../interfaces/customer-repository.interface';
import { CustomerMergeService } from '../../domain/services/customer-merge.service';
import type { UnifiedCustomerOutput } from '../../domain/services/customer-merge.service';
import { CustomerNotFoundException } from '../../domain/exceptions/customer-not-found.exception';
import { INJECTION_TOKENS } from '../../../shared/constants/injection-tokens';

@Injectable()
export class GetCustomerByEmailUseCase {
  private readonly logger = new Logger(GetCustomerByEmailUseCase.name);

  constructor(
    @Inject(INJECTION_TOKENS.SYSTEM_A_REPOSITORY)
    private readonly systemA: ICustomerRepository,
    @Inject(INJECTION_TOKENS.SYSTEM_B_REPOSITORY)
    private readonly systemB: ICustomerRepository,
    private readonly mergeService: CustomerMergeService,
  ) {}

  async execute(email: string): Promise<UnifiedCustomerOutput> {
    const normalizedEmail = email.toLowerCase().trim();

    const [customerA, customerB] = await Promise.all([
      this.systemA.findByEmail(normalizedEmail),
      this.systemB.findByEmail(normalizedEmail),
    ]);

    if (!customerA && !customerB) {
      throw new CustomerNotFoundException(normalizedEmail);
    }

    const result = this.mergeService.merge(customerA, customerB);

    // Mark as partial if one system returned null while the other has data
    if ((!customerA && customerB) || (customerA && !customerB)) {
      result._metadata.isPartial = true;
    }

    return result;
  }
}
