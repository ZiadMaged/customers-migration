import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SourceSystem } from '../../../domain/enums/source-system.enum';

export class FieldMetadataDto {
  @ApiProperty({
    example: SourceSystem.SYSTEM_B,
    enum: SourceSystem,
  })
  source!: SourceSystem;

  @ApiProperty({ example: false })
  conflict!: boolean;

  @ApiPropertyOptional({ example: 'Sonnenallee 1, 12345 Berlin' })
  systemAValue?: string | null;

  @ApiPropertyOptional({ example: 'Sonnenallee 1a, 12345 Berlin' })
  systemBValue?: string | null;
}

export class IdentifiersDto {
  @ApiPropertyOptional({ example: 'legacy_001' })
  systemAId!: string | null;

  @ApiPropertyOptional({ example: 'modern_101' })
  systemBUuid!: string | null;
}

export class CustomerMetadataDto {
  @ApiProperty({ example: [SourceSystem.SYSTEM_A, SourceSystem.SYSTEM_B] })
  sources!: SourceSystem[];

  @ApiProperty({ example: false })
  isPartial!: boolean;

  @ApiProperty({ example: true })
  conflictsDetected!: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/FieldMetadataDto' },
    example: {
      name: { source: SourceSystem.BOTH, conflict: false },
      address: {
        source: SourceSystem.SYSTEM_B,
        conflict: true,
        systemAValue: 'Sonnenallee 1, 12345 Berlin',
        systemBValue: 'Sonnenallee 1a, 12345 Berlin',
      },
    },
  })
  fields!: Record<string, FieldMetadataDto>;
}

export class UnifiedCustomerResponseDto {
  @ApiProperty({ example: 'max.mustermann@example.de' })
  email!: string;

  @ApiProperty({ example: 'Max Mustermann' })
  name!: string;

  @ApiPropertyOptional({ example: '+49 170 123 4567' })
  phone!: string | null;

  @ApiProperty({ example: 'Sonnenallee 1a, 12345 Berlin' })
  address!: string;

  @ApiPropertyOptional({ example: '2021-03-15' })
  contractStartDate!: string | null;

  @ApiPropertyOptional({ example: 'RENTAL' })
  contractType!: string | null;

  @ApiProperty({ type: IdentifiersDto })
  identifiers!: IdentifiersDto;

  @ApiProperty({ type: CustomerMetadataDto })
  _metadata!: CustomerMetadataDto;
}
