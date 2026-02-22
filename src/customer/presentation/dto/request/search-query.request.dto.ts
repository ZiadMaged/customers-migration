import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SearchQueryRequestDto {
  @ApiProperty({
    description: 'Search query (partial name match, case-insensitive)',
    example: 'mueller',
    minLength: 2,
  })
  @IsString()
  @MinLength(2)
  q!: string;
}
