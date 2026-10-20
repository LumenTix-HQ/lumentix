import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import KeyvRedis from '@keyv/redis';

@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('REDIS_HOST') ?? 'localhost';
        const port = configService.get<number>('REDIS_PORT') ?? 6379;
        return { stores: [new KeyvRedis(`redis://${host}:${port}`)] };
      },
    }),
  ],
  exports: [CacheModule],
})
export class RedisModule {}
