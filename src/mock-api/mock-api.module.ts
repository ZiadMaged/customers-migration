import { Module } from '@nestjs/common';
import { MockApiController } from './mock-api.controller';

@Module({
  controllers: [MockApiController],
})
export class MockApiModule {}
