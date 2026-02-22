import { Injectable, Inject, Logger } from '@nestjs/common';
import { ICustomerRepository } from '../interfaces/customer-repository.interface';
import { CustomerMergeService } from '../../domain/services/customer-merge.service';
import type { SyncResultOutput } from '../../domain/services/customer-merge.service';
import { CustomerNotFoundException } from '../../domain/exceptions/customer-not-found.exception';
import { INJECTION_TOKENS } from '../../../shared/constants/injection-tokens';
import { SourceSystem } from '../../domain/enums/source-system.enum';

@Injectable()
export class SyncCustomerUseCase {
  private readonly logger = new Logger(SyncCustomerUseCase.name);

  constructor(
    @Inject(INJECTION_TOKENS.SYSTEM_A_REPOSITORY)
    private readonly systemA: ICustomerRepository,
    @Inject(INJECTION_TOKENS.SYSTEM_B_REPOSITORY)
    private readonly systemB: ICustomerRepository,
    private readonly mergeService: CustomerMergeService,
  ) {}

  async execute(email: string): Promise<SyncResultOutput> {
    const normalizedEmail = email.toLowerCase().trim();

    const [customerA, customerB] = await Promise.all([
      this.systemA.findByEmail(normalizedEmail),
      this.systemB.findByEmail(normalizedEmail),
    ]);

    if (!customerA && !customerB) {
      throw new CustomerNotFoundException(normalizedEmail);
    }

    // If only in one system, return single_source_only
    if (customerA && !customerB) {
      return {
        email: normalizedEmail,
        status: 'single_source_only',
        presentIn: SourceSystem.SYSTEM_A,
        lastUpdated: {
          systemA: customerA.lastUpdated.toISOString(),
          systemB: null,
        },
        conflicts: [],
        matchedFields: [],
      };
    }

    if (!customerA && customerB) {
      return {
        email: normalizedEmail,
        status: 'single_source_only',
        presentIn: SourceSystem.SYSTEM_B,
        lastUpdated: {
          systemA: null,
          systemB: customerB.lastUpdated.toISOString(),
        },
        conflicts: [],
        matchedFields: [],
      };
    }

    // Both exist — run diff
    this.logger.log(`Running sync diff for ${normalizedEmail}`);
    return this.mergeService.diff(customerA!, customerB!);
  }
}
