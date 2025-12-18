import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global() // Global so you don't have to import it everywhere
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
