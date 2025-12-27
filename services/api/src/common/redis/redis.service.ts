import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    // 1. Get the URL from env, defaulting to localhost for local dev safety
    const redisUrl =
      this.config.get<string>('REDIS_URL') || 'redis://localhost:6379';

    // 2. Define robust connection options
    const options: RedisOptions = {
      // Retry Strategy: Linear backoff (50ms -> 2000ms max)
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      // Ensure we don't crash on initial boot if Redis is slow
      maxRetriesPerRequest: null,
    };

    // 3. Initialize with URL + Options
    this.client = new Redis(redisUrl, options);

    // 4. CRITICAL FIX: Error Handling (Prevents "Silent Death" or Unhandled Promise Rejections)
    this.client.on('error', (err) => {
      // Don't throw; log it. ioredis retries in the background automatically.
      this.logger.warn(`Redis connection error: ${err.message}`);
    });

    this.client.on('connect', () => {
      // Mask the URL for security logs, showing only the host
      const host = redisUrl.includes('@')
        ? redisUrl.split('@')[1]
        : 'localhost';
      this.logger.log(`✅ Redis connected successfully to: ${host}`);
    });
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const data = await this.client.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds: number) {
    const stringValue = JSON.stringify(value);
    await this.client.setex(key, ttlSeconds, stringValue);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  // Optional: Expose the raw client if other modules need advanced commands
  getClient(): Redis {
    return this.client;
  }
}
