import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SyncRequestDto {
  @ApiProperty({
    description: 'Email of the customer to sync-check across both systems',
    example: 'sophie.mueller@example.de',
  })
  @IsEmail()
  email!: string;
}
