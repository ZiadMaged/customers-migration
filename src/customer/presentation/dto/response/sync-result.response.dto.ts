import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SourceSystem } from '../../../domain/enums/source-system.enum';

export class FieldConflictDto {
  @ApiProperty({ example: 'name' })
  field!: string;

  @ApiPropertyOptional({ example: 'Sophie Muller' })
  systemAValue!: string | null;

  @ApiPropertyOptional({ example: 'Sophie Mueller' })
  systemBValue!: string | null;

  @ApiProperty({ example: SourceSystem.SYSTEM_B, enum: SourceSystem })
  newerSource!: SourceSystem;
}

export class SyncLastUpdatedDto {
  @ApiPropertyOptional({ example: '2024-10-05T16:00:00Z' })
  systemA!: string | null;

  @ApiPropertyOptional({ example: '2025-02-01T09:30:00Z' })
  systemB!: string | null;
}

export class SyncResultResponseDto {
  @ApiProperty({ example: 'sophie.mueller@example.de' })
  email!: string;

  @ApiProperty({
    example: 'conflicts_found',
    enum: ['in_sync', 'conflicts_found', 'single_source_only'],
  })
  status!: string;

  @ApiPropertyOptional({
    example: SourceSystem.SYSTEM_A,
    enum: SourceSystem,
  })
  presentIn?: SourceSystem;

  @ApiProperty({ type: SyncLastUpdatedDto })
  lastUpdated!: SyncLastUpdatedDto;

  @ApiProperty({ type: [FieldConflictDto] })
  conflicts!: FieldConflictDto[];

  @ApiProperty({ example: ['email'] })
  matchedFields!: string[];
}
