import { Global, Module } from '@nestjs/common';
import { RedisProvider } from '../providers/redis.provider';
import { DrizzleProvider } from '../providers/drizzle.provider';

@Global()
@Module({
  providers: [RedisProvider, DrizzleProvider],
  exports: [RedisProvider, DrizzleProvider],
})
export class InfrastructureModule {}
