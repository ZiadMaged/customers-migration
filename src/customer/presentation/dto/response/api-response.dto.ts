import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T> {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty()
  data!: T;

  @ApiProperty({ example: '2026-02-22T10:00:00.000Z' })
  timestamp!: string;
}

export class ErrorDetailDto {
  @ApiProperty({ example: 'email' })
  field!: string;

  @ApiProperty({ example: { validation: 'email must be a valid email' } })
  constraints!: Record<string, string>;
}

export class ErrorBodyDto {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({ example: 'Customer not found' })
  message!: string;

  @ApiProperty({ type: [ErrorDetailDto], example: [] })
  details!: ErrorDetailDto[];
}

export class ApiErrorDto {
  @ApiProperty({ example: false })
  success!: boolean;

  @ApiProperty({ type: ErrorBodyDto })
  error!: ErrorBodyDto;

  @ApiProperty({ example: '2026-02-22T10:00:00.000Z' })
  timestamp!: string;
}
