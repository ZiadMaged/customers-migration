import { Injectable, Inject, Logger } from '@nestjs/common';
import { ICustomerRepository } from '../interfaces/customer-repository.interface';
import { CustomerMergeService } from '../../domain/services/customer-merge.service';
import type { UnifiedCustomerOutput } from '../../domain/services/customer-merge.service';
import { INJECTION_TOKENS } from '../../../shared/constants/injection-tokens';
import { Customer } from '../../domain/entities/customer.entity';

@Injectable()
export class SearchCustomersUseCase {
  private readonly logger = new Logger(SearchCustomersUseCase.name);

  constructor(
    @Inject(INJECTION_TOKENS.SYSTEM_A_REPOSITORY)
    private readonly systemA: ICustomerRepository,
    @Inject(INJECTION_TOKENS.SYSTEM_B_REPOSITORY)
    private readonly systemB: ICustomerRepository,
    private readonly mergeService: CustomerMergeService,
  ) {}

  async execute(query: string): Promise<UnifiedCustomerOutput[]> {
    const [customersA, customersB] = await Promise.all([
      this.systemA.searchByName(query),
      this.systemB.searchByName(query),
    ]);

    // Create lookup maps by email
    const mapA = new Map<string, Customer>();
    for (const c of customersA) {
      mapA.set(c.email, c);
    }
    const mapB = new Map<string, Customer>();
    for (const c of customersB) {
      mapB.set(c.email, c);
    }

    // Collect all unique emails
    const allEmails = new Set<string>([...mapA.keys(), ...mapB.keys()]);

    // Cross-reference: for records found in only one system,
    // try to look up by email in the other system for a complete merge
    const crossRefPromises: Promise<void>[] = [];
    for (const email of allEmails) {
      if (!mapA.has(email)) {
        crossRefPromises.push(
          this.systemA
            .findByEmail(email)
            .then((c) => {
              if (c) mapA.set(email, c);
            })
            .catch(() => {}),
        );
      }
      if (!mapB.has(email)) {
        crossRefPromises.push(
          this.systemB
            .findByEmail(email)
            .then((c) => {
              if (c) mapB.set(email, c);
            })
            .catch(() => {}),
        );
      }
    }
    await Promise.all(crossRefPromises);

    const results: UnifiedCustomerOutput[] = [];

    for (const email of allEmails) {
      const a = mapA.get(email) ?? null;
      const b = mapB.get(email) ?? null;

      const merged = this.mergeService.merge(a, b);

      // Mark as partial if one system returned null while the other has data
      if ((!a && b) || (a && !b)) {
        merged._metadata.isPartial = true;
      }

      results.push(merged);
    }

    return results;
  }
}
