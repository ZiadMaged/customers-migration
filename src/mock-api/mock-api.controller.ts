import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { SYSTEM_B_MOCK_DATA } from './mock-data';

function randomDelay(): Promise<void> {
  const ms = Math.floor(Math.random() * 300) + 20000; // 200-500ms
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@ApiTags('mock-api')
@Controller('mock-api')
export class MockApiController {
  private readonly logger = new Logger(MockApiController.name);

  @Get('ping')
  @ApiOperation({ summary: 'Health check for mock System B API' })
  async ping() {
    await randomDelay();

    return { status: 'ok' };
  }

  @Get('customers/:email')
  @ApiOperation({ summary: 'Get customer by email (mock System B)' })
  @ApiParam({ name: 'email', description: 'Customer email address' })
  async getByEmail(@Param('email') email: string) {
    await randomDelay();

    const customer = SYSTEM_B_MOCK_DATA.find(
      (c) => c.email.toLowerCase() === email.toLowerCase(),
    );

    if (!customer) {
      this.logger.debug(`Mock API: Customer not found for email ${email}`);
      throw new NotFoundException(`Customer not found: ${email}`);
    }

    this.logger.debug(`Mock API: Returning customer ${customer.uuid}`);
    return customer;
  }

  @Get('customers')
  @ApiOperation({ summary: 'Search customers by name (mock System B)' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  async search(@Query('q') query: string) {
    await randomDelay();

    if (!query || query.length < 1) {
      return [];
    }

    const results = SYSTEM_B_MOCK_DATA.filter((c) =>
      c.name.toLowerCase().includes(query.toLowerCase()),
    );

    this.logger.debug(
      `Mock API: Found ${results.length} results for query "${query}"`,
    );
    return results;
  }
}
