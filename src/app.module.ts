import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { CustomerModule } from './customer/customer.module';
import { MockApiModule } from './mock-api/mock-api.module';
import { CustomerAEntity } from './customer/infrastructure/persistence/entities/customer-a.orm-entity';

@Module({
  imports: [
    // Structured logging
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
      },
    }),

    // SQLite database for System A
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: './data/customers.db',
      entities: [CustomerAEntity],
      synchronize: true, // Auto-create schema (dev only)
    }),

    // Feature modules
    CustomerModule,
    MockApiModule,
  ],
})
export class AppModule {}
