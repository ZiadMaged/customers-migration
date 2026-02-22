import { CustomerMergeService } from '../../src/customer/domain/services/customer-merge.service';
import { Customer } from '../../src/customer/domain/entities/customer.entity';
import { SourceSystem } from '../../src/customer/domain/enums/source-system.enum';

describe('CustomerMergeService', () => {
  let service: CustomerMergeService;

  beforeEach(() => {
    service = new CustomerMergeService();
  });

  const makeCustomer = (
    overrides: Partial<ConstructorParameters<typeof Customer>[0]> = {},
  ): Customer =>
    new Customer({
      id: 'id-a',
      email: 'max@example.de',
      name: 'Max Mustermann',
      address: 'Musterstr. 1, 12345 Berlin',
      phone: null,
      contractStartDate: '2020-01-01',
      contractType: 'premium',
      lastUpdated: new Date('2024-01-01'),
      source: SourceSystem.SYSTEM_A,
      ...overrides,
    });

  describe('merge()', () => {
    it('should merge two complete records following priority rules', () => {
      const a = makeCustomer({
        address: 'Old Addr 1',
        phone: null,
        contractStartDate: '2020-01-01',
        contractType: 'premium',
      });
      const b = makeCustomer({
        id: 'uuid-b',
        address: 'New Addr 1a',
        phone: '+49 170 1234567',
        contractStartDate: null,
        contractType: null,
        source: SourceSystem.SYSTEM_B,
      });

      const result = service.merge(a, b);

      // Address: System B wins
      expect(result.address).toBe('New Addr 1a');
      // Phone: System B wins
      expect(result.phone).toBe('+49 170 1234567');
      // Contract: System A wins
      expect(result.contractStartDate).toBe('2020-01-01');
      expect(result.contractType).toBe('premium');
      // Name: System A default
      expect(result.name).toBe('Max Mustermann');
      // Identifiers
      expect(result.identifiers.systemAId).toBe('id-a');
      expect(result.identifiers.systemBUuid).toBe('uuid-b');
      // Metadata
      expect(result._metadata.sources).toEqual([
        SourceSystem.SYSTEM_A,
        SourceSystem.SYSTEM_B,
      ]);
      expect(result._metadata.isPartial).toBe(false);
      // Address conflict detected
      expect(result._metadata.fields['address'].conflict).toBe(true);
      expect(result._metadata.fields['address'].systemAValue).toBe(
        'Old Addr 1',
      );
      expect(result._metadata.fields['address'].systemBValue).toBe(
        'New Addr 1a',
      );
    });

    it('should detect name conflict when names differ', () => {
      const a = makeCustomer({ name: 'Max Muller' });
      const b = makeCustomer({
        id: 'uuid-b',
        name: 'Max Mueller',
        source: SourceSystem.SYSTEM_B,
      });

      const result = service.merge(a, b);

      expect(result.name).toBe('Max Muller'); // System A wins
      expect(result._metadata.conflictsDetected).toBe(true);
      expect(result._metadata.fields['name'].conflict).toBe(true);
      expect(result._metadata.fields['name'].systemAValue).toBe('Max Muller');
      expect(result._metadata.fields['name'].systemBValue).toBe('Max Mueller');
    });

    it('should not flag conflict when names match', () => {
      const a = makeCustomer({ name: 'Max Mustermann' });
      const b = makeCustomer({
        id: 'uuid-b',
        name: 'Max Mustermann',
        source: SourceSystem.SYSTEM_B,
      });

      const result = service.merge(a, b);

      expect(result._metadata.fields['name'].conflict).toBe(false);
      expect(result._metadata.fields['name'].source).toBe(SourceSystem.BOTH);
    });

    it('should return single source result when only System A available', () => {
      const a = makeCustomer({
        contractStartDate: '2020-01-01',
        contractType: 'basic',
      });

      const result = service.merge(a, null);

      expect(result.email).toBe('max@example.de');
      expect(result.identifiers.systemAId).toBe('id-a');
      expect(result.identifiers.systemBUuid).toBeNull();
      expect(result._metadata.sources).toEqual([SourceSystem.SYSTEM_A]);
      expect(result._metadata.isPartial).toBe(false);
      expect(result._metadata.conflictsDetected).toBe(false);
    });

    it('should return single source result when only System B available', () => {
      const b = makeCustomer({
        id: 'uuid-b',
        phone: '+49 170 1234567',
        contractStartDate: null,
        contractType: null,
        source: SourceSystem.SYSTEM_B,
      });

      const result = service.merge(null, b);

      expect(result.identifiers.systemAId).toBeNull();
      expect(result.identifiers.systemBUuid).toBe('uuid-b');
      expect(result._metadata.sources).toEqual([SourceSystem.SYSTEM_B]);
      expect(result.phone).toBe('+49 170 1234567');
    });

    it('should throw when both sources are null', () => {
      expect(() => service.merge(null, null)).toThrow(
        'Cannot merge: no customer data from either system',
      );
    });

    it('should prefer System A phone when System B has none', () => {
      const a = makeCustomer({ phone: '+49 111 0000000' });
      const b = makeCustomer({
        id: 'uuid-b',
        phone: null,
        source: SourceSystem.SYSTEM_B,
      });

      const result = service.merge(a, b);

      expect(result.phone).toBe('+49 111 0000000');
      expect(result._metadata.fields['phone'].source).toBe(
        SourceSystem.SYSTEM_A,
      );
    });

    it('should prefer System B contract when System A has none', () => {
      const a = makeCustomer({ contractStartDate: null, contractType: null });
      const b = makeCustomer({
        id: 'uuid-b',
        contractStartDate: '2023-06-01',
        contractType: 'enterprise',
        source: SourceSystem.SYSTEM_B,
      });

      const result = service.merge(a, b);

      expect(result.contractStartDate).toBe('2023-06-01');
      expect(result.contractType).toBe('enterprise');
      expect(result._metadata.fields['contractStartDate'].source).toBe(
        SourceSystem.SYSTEM_B,
      );
      expect(result._metadata.fields['contractType'].source).toBe(
        SourceSystem.SYSTEM_B,
      );
    });
  });

  describe('diff()', () => {
    it('should return in_sync when all fields match', () => {
      const a = makeCustomer();
      const b = makeCustomer({ id: 'uuid-b', source: SourceSystem.SYSTEM_B });

      const result = service.diff(a, b);

      expect(result.status).toBe('in_sync');
      expect(result.conflicts).toHaveLength(0);
      expect(result.matchedFields).toContain('email');
      expect(result.matchedFields).toContain('name');
      expect(result.matchedFields).toContain('address');
    });

    it('should detect multiple conflicts', () => {
      const a = makeCustomer({
        name: 'Sophie Muller',
        address: 'Addr A',
        phone: '+49 111',
        contractStartDate: '2020-01-01',
        contractType: 'basic',
        lastUpdated: new Date('2023-01-01'),
      });
      const b = makeCustomer({
        id: 'uuid-b',
        name: 'Sophie Mueller',
        address: 'Addr B',
        phone: '+49 222',
        contractStartDate: '2022-06-15',
        contractType: 'premium',
        lastUpdated: new Date('2024-06-01'),
        source: SourceSystem.SYSTEM_B,
      });

      const result = service.diff(a, b);

      expect(result.status).toBe('conflicts_found');
      expect(result.conflicts.length).toBe(5);
      const conflictFields = result.conflicts.map((c) => c.field);
      expect(conflictFields).toContain('name');
      expect(conflictFields).toContain('address');
      expect(conflictFields).toContain('phone');
      expect(conflictFields).toContain('contractStartDate');
      expect(conflictFields).toContain('contractType');

      // newerSource should be system_b (more recent lastUpdated)
      for (const conflict of result.conflicts) {
        expect(conflict.newerSource).toBe(SourceSystem.SYSTEM_B);
      }
    });

    it('should identify newerSource as system_a when A is newer', () => {
      const a = makeCustomer({
        name: 'A Name',
        lastUpdated: new Date('2025-01-01'),
      });
      const b = makeCustomer({
        id: 'uuid-b',
        name: 'B Name',
        lastUpdated: new Date('2023-01-01'),
        source: SourceSystem.SYSTEM_B,
      });

      const result = service.diff(a, b);

      const nameConflict = result.conflicts.find((c) => c.field === 'name');
      expect(nameConflict?.newerSource).toBe(SourceSystem.SYSTEM_A);
    });

    it('should skip fields where both values are null', () => {
      const a = makeCustomer({
        phone: null,
        contractStartDate: null,
        contractType: null,
      });
      const b = makeCustomer({
        id: 'uuid-b',
        phone: null,
        contractStartDate: null,
        contractType: null,
        source: SourceSystem.SYSTEM_B,
      });

      const result = service.diff(a, b);

      const conflictFields = result.conflicts.map((c) => c.field);
      expect(conflictFields).not.toContain('phone');
      expect(conflictFields).not.toContain('contractStartDate');
      expect(conflictFields).not.toContain('contractType');
    });

    it('should flag conflict when one has value and other is null', () => {
      const a = makeCustomer({ phone: '+49 111', contractType: 'basic' });
      const b = makeCustomer({
        id: 'uuid-b',
        phone: null,
        contractType: null,
        source: SourceSystem.SYSTEM_B,
      });

      const result = service.diff(a, b);

      const phoneConflict = result.conflicts.find((c) => c.field === 'phone');
      expect(phoneConflict).toBeDefined();
      expect(phoneConflict!.systemAValue).toBe('+49 111');
      expect(phoneConflict!.systemBValue).toBeNull();
    });
  });
});
