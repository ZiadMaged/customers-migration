import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  BadRequestException,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { GetCustomerByEmailUseCase } from '../../application/use-cases/get-customer-by-email.use-case';
import { SearchCustomersUseCase } from '../../application/use-cases/search-customers.use-case';
import { SyncCustomerUseCase } from '../../application/use-cases/sync-customer.use-case';
import { SearchQueryRequestDto } from '../dto/request/search-query.request.dto';
import { SyncRequestDto } from '../dto/request/sync.request.dto';
import { UnifiedCustomerResponseDto } from '../dto/response/unified-customer.response.dto';
import { SyncResultResponseDto } from '../dto/response/sync-result.response.dto';
import { ApiErrorDto } from '../dto/response/api-response.dto';
import { ResponseWrapperInterceptor } from '../../../shared/interceptors/response-wrapper.interceptor';
import { Email } from '../../domain/value-objects/email.vo';

@ApiTags('customers')
@Controller('customer')
@UseInterceptors(ResponseWrapperInterceptor)
export class CustomerController {
  constructor(
    private readonly getCustomerByEmail: GetCustomerByEmailUseCase,
    private readonly searchCustomers: SearchCustomersUseCase,
    private readonly syncCustomer: SyncCustomerUseCase,
  ) {}

  @Get('search')
  @ApiOperation({
    summary: 'Search customers across both systems',
    description:
      'Searches by partial name match (case-insensitive) across System A and System B. Returns merged results.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of matching customers (may be empty)',
    type: [UnifiedCustomerResponseDto],
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid query parameter',
    type: ApiErrorDto,
  })
  async search(
    @Query() query: SearchQueryRequestDto,
  ): Promise<UnifiedCustomerResponseDto[]> {
    const results = await this.searchCustomers.execute(query.q);
    return results as UnifiedCustomerResponseDto[];
  }

  @Get(':email')
  @ApiOperation({
    summary: 'Get unified customer by email',
    description:
      'Returns a merged customer record from both systems. If System B is unavailable, returns System A data marked as partial.',
  })
  @ApiParam({
    name: 'email',
    description: 'Customer email address',
    example: 'max.mustermann@example.de',
  })
  @ApiResponse({
    status: 200,
    description: 'Unified customer record',
    type: UnifiedCustomerResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Customer not found in any system',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid email format',
    type: ApiErrorDto,
  })
  async findByEmail(
    @Param('email') email: string,
  ): Promise<UnifiedCustomerResponseDto> {
    if (!Email.isValid(email)) {
      throw new BadRequestException(`Invalid email format: ${email}`);
    }

    const result = await this.getCustomerByEmail.execute(email);
    return result as UnifiedCustomerResponseDto;
  }

  @Post('sync')
  @ApiOperation({
    summary: 'Sync check / conflict detection',
    description:
      'Compares a customer record across both systems and returns a structured diff showing field conflicts and which system has newer data.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sync result with conflict details',
    type: SyncResultResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Customer not found in any system',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid email',
    type: ApiErrorDto,
  })
  async sync(@Body() dto: SyncRequestDto): Promise<SyncResultResponseDto> {
    const result = await this.syncCustomer.execute(dto.email);
    return result as SyncResultResponseDto;
  }
}
