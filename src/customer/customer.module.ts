import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { TerminusModule } from '@nestjs/terminus';

// Domain
import { CustomerMergeService } from './domain/services/customer-merge.service';

// Application - Use Cases
import { GetCustomerByEmailUseCase } from './application/use-cases/get-customer-by-email.use-case';
import { SearchCustomersUseCase } from './application/use-cases/search-customers.use-case';
import { SyncCustomerUseCase } from './application/use-cases/sync-customer.use-case';
import { CheckHealthUseCase } from './application/use-cases/check-health.use-case';

// Infrastructure - Persistence
import { CustomerAEntity } from './infrastructure/persistence/entities/customer-a.orm-entity';
import { SystemARepository } from './infrastructure/persistence/repositories/system-a.repository';
import { SystemASeeder } from './infrastructure/persistence/seeders/system-a.seeder';

// Infrastructure - HTTP
import { SystemBClient } from './infrastructure/http/system-b.client';

// Presentation
import { CustomerController } from './presentation/controllers/customer.controller';
import { HealthController } from './presentation/controllers/health.controller';

// Shared
import { INJECTION_TOKENS } from '../shared/constants/injection-tokens';

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomerAEntity]),
    TerminusModule,
    HttpModule.registerAsync({
      useFactory: () => ({
        baseURL: `http://localhost:${process.env.PORT ?? 3000}/mock-api`,
        timeout: 5000,
      }),
    }),
  ],
  controllers: [CustomerController, HealthController],
  providers: [
    // Domain service (no interface needed — pure business logic)
    CustomerMergeService,

    // Application use cases
    GetCustomerByEmailUseCase,
    SearchCustomersUseCase,
    SyncCustomerUseCase,
    CheckHealthUseCase,

    // Infrastructure: bind interfaces → implementations
    {
      provide: INJECTION_TOKENS.SYSTEM_A_REPOSITORY,
      useClass: SystemARepository,
    },
    {
      provide: INJECTION_TOKENS.SYSTEM_B_REPOSITORY,
      useClass: SystemBClient,
    },

    // Seeder
    SystemASeeder,
  ],
})
export class CustomerModule {}
