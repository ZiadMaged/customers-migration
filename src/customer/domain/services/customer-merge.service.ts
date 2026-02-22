import { Customer } from '../entities/customer.entity';
import { SourceSystem } from '../enums/source-system.enum';

export interface FieldMetadata {
  source: SourceSystem;
  conflict: boolean;
  systemAValue?: string | null;
  systemBValue?: string | null;
}

export interface UnifiedCustomerMetadata {
  sources: string[];
  isPartial: boolean;
  conflictsDetected: boolean;
  fields: Record<string, FieldMetadata>;
}

export interface UnifiedCustomerOutput {
  email: string;
  name: string;
  phone: string | null;
  address: string;
  contractStartDate: string | null;
  contractType: string | null;
  identifiers: {
    systemAId: string | null;
    systemBUuid: string | null;
  };
  _metadata: UnifiedCustomerMetadata;
}

export interface FieldConflict {
  field: string;
  systemAValue: string | null;
  systemBValue: string | null;
  newerSource: SourceSystem;
}

export interface SyncResultOutput {
  email: string;
  status: 'in_sync' | 'conflicts_found' | 'single_source_only';
  presentIn?: SourceSystem;
  lastUpdated: {
    systemA: string | null;
    systemB: string | null;
  };
  conflicts: FieldConflict[];
  matchedFields: string[];
}

/**
 * Domain service responsible for merging customer records from two systems
 * and detecting conflicts. Contains pure business logic with no external deps.
 *
 * Priority rules:
 *  - phone, address: System B wins
 *  - contractStartDate, contractType: System A wins
 *  - name: whichever system has the most recent lastUpdated wins; conflict flagged if different
 *  - email: join key (always matches)
 *  - Fields only in one system: included
 */
export class CustomerMergeService {
  merge(
    systemA: Customer | null,
    systemB: Customer | null,
  ): UnifiedCustomerOutput {
    if (!systemA && !systemB) {
      throw new Error('Cannot merge: no customer data from either system');
    }

    // Only System A available
    if (systemA && !systemB) {
      return this.buildSingleSourceResult(systemA, SourceSystem.SYSTEM_A);
    }

    // Only System B available
    if (!systemA && systemB) {
      return this.buildSingleSourceResult(systemB, SourceSystem.SYSTEM_B);
    }

    // Both systems available — apply merge rules
    return this.mergeFromBothSystems(systemA!, systemB!);
  }

  diff(systemA: Customer, systemB: Customer): SyncResultOutput {
    const newerSource =
      systemA.lastUpdated >= systemB.lastUpdated
        ? SourceSystem.SYSTEM_A
        : SourceSystem.SYSTEM_B;

    const fieldsToCompare: {
      field: string;
      aVal: string | null;
      bVal: string | null;
    }[] = [
      { field: 'name', aVal: systemA.name, bVal: systemB.name },
      { field: 'address', aVal: systemA.address, bVal: systemB.address },
      { field: 'phone', aVal: systemA.phone, bVal: systemB.phone },
      {
        field: 'contractStartDate',
        aVal: systemA.contractStartDate,
        bVal: systemB.contractStartDate,
      },
      {
        field: 'contractType',
        aVal: systemA.contractType,
        bVal: systemB.contractType,
      },
    ];

    const conflicts: FieldConflict[] = [];
    const matchedFields: string[] = ['email']; // email always matches

    for (const { field, aVal, bVal } of fieldsToCompare) {
      // Skip comparison if both are null/undefined
      if (aVal == null && bVal == null) {
        continue;
      }

      if (aVal === bVal) {
        matchedFields.push(field);
      } else {
        // Only flag as conflict if both have values, or one has a value the other doesn't
        conflicts.push({
          field,
          systemAValue: aVal,
          systemBValue: bVal,
          newerSource,
        });
      }
    }

    return {
      email: systemA.email,
      status: conflicts.length > 0 ? 'conflicts_found' : 'in_sync',
      lastUpdated: {
        systemA: systemA.lastUpdated.toISOString(),
        systemB: systemB.lastUpdated.toISOString(),
      },
      conflicts,
      matchedFields,
    };
  }

  private mergeFromBothSystems(
    systemA: Customer,
    systemB: Customer,
  ): UnifiedCustomerOutput {
    const fields: Record<string, FieldMetadata> = {};

    // Name: pick from whichever system was updated most recently
    const nameConflict = systemA.name !== systemB.name;
    const newerNameSource =
      systemB.lastUpdated > systemA.lastUpdated
        ? SourceSystem.SYSTEM_B
        : SourceSystem.SYSTEM_A;
    fields['name'] = {
      source: nameConflict ? newerNameSource : SourceSystem.BOTH,
      conflict: nameConflict,
      ...(nameConflict && {
        systemAValue: systemA.name,
        systemBValue: systemB.name,
      }),
    };

    // Phone: System B wins (System A typically doesn't have it)
    if (systemB.phone) {
      fields['phone'] = {
        source: SourceSystem.SYSTEM_B,
        conflict: false,
      };
    } else if (systemA.phone) {
      fields['phone'] = {
        source: SourceSystem.SYSTEM_A,
        conflict: false,
      };
    }

    // Address: System B wins
    const addressConflict =
      systemA.address !== systemB.address &&
      systemA.address != null &&
      systemB.address != null;
    fields['address'] = {
      source: SourceSystem.SYSTEM_B,
      conflict: addressConflict,
      ...(addressConflict && {
        systemAValue: systemA.address,
        systemBValue: systemB.address,
      }),
    };

    // Contract start date: System A wins
    if (systemA.contractStartDate) {
      fields['contractStartDate'] = {
        source: SourceSystem.SYSTEM_A,
        conflict: false,
      };
    } else if (systemB.contractStartDate) {
      fields['contractStartDate'] = {
        source: SourceSystem.SYSTEM_B,
        conflict: false,
      };
    }

    // Contract type: System A wins
    if (systemA.contractType) {
      fields['contractType'] = {
        source: SourceSystem.SYSTEM_A,
        conflict: false,
      };
    } else if (systemB.contractType) {
      fields['contractType'] = {
        source: SourceSystem.SYSTEM_B,
        conflict: false,
      };
    }

    const conflictsDetected = Object.values(fields).some((f) => f.conflict);

    // Name: use whichever system was updated most recently
    const mergedName =
      systemB.lastUpdated > systemA.lastUpdated ? systemB.name : systemA.name;

    return {
      email: systemA.email,
      name: mergedName,
      phone: systemB.phone ?? systemA.phone,
      address: systemB.address, // System B wins for address
      contractStartDate: systemA.contractStartDate ?? systemB.contractStartDate,
      contractType: systemA.contractType ?? systemB.contractType,
      identifiers: {
        systemAId: systemA.id,
        systemBUuid: systemB.id,
      },
      _metadata: {
        sources: [SourceSystem.SYSTEM_A, SourceSystem.SYSTEM_B],
        isPartial: false,
        conflictsDetected,
        fields,
      },
    };
  }

  private buildSingleSourceResult(
    customer: Customer,
    source: SourceSystem,
  ): UnifiedCustomerOutput {
    const fields: Record<string, FieldMetadata> = {};

    fields['name'] = { source, conflict: false };
    if (customer.address) fields['address'] = { source, conflict: false };
    if (customer.phone) fields['phone'] = { source, conflict: false };
    if (customer.contractStartDate)
      fields['contractStartDate'] = { source, conflict: false };
    if (customer.contractType)
      fields['contractType'] = { source, conflict: false };

    return {
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      contractStartDate: customer.contractStartDate,
      contractType: customer.contractType,
      identifiers: {
        systemAId: source === SourceSystem.SYSTEM_A ? customer.id : null,
        systemBUuid: source === SourceSystem.SYSTEM_B ? customer.id : null,
      },
      _metadata: {
        sources: [source],
        isPartial: false,
        conflictsDetected: false,
        fields,
      },
    };
  }
}
