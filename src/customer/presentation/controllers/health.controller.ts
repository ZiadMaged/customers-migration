import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { CheckHealthUseCase } from '../../application/use-cases/check-health.use-case';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly checkHealthUseCase: CheckHealthUseCase,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Health check for both data sources' })
  @ApiResponse({ status: 200, description: 'Both systems healthy' })
  @ApiResponse({ status: 503, description: 'One or more systems unhealthy' })
  check() {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => {
        const status = await this.checkHealthUseCase.execute();
        return {
          'system-a': { status: status.systemA ? 'up' : 'down' },
          'system-b': { status: status.systemB ? 'up' : 'down' },
        };
      },
    ]);
  }
}
