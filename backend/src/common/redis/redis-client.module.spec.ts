import { Inject, Injectable, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from './redis.provider';
import { RedisClientModule } from './redis-client.module';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({ quit: jest.fn(), on: jest.fn() }));
});

@Injectable()
class ConsumerA {
  constructor(@Inject(REDIS_CLIENT) readonly redis: unknown) {}
}

@Injectable()
class ConsumerB {
  constructor(@Inject(REDIS_CLIENT) readonly redis: unknown) {}
}

@Module({ providers: [ConsumerA], exports: [ConsumerA] })
class FeatureAModule {}

@Module({ providers: [ConsumerB], exports: [ConsumerB] })
class FeatureBModule {}

describe('RedisClientModule', () => {
  it('lets modules that do not import it inject the same REDIS_CLIENT', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        RedisClientModule,
        FeatureAModule,
        FeatureBModule,
      ],
    }).compile();

    const a = moduleRef.get(ConsumerA);
    const b = moduleRef.get(ConsumerB);

    expect(a.redis).toBeDefined();
    expect(a.redis).toBe(b.redis);
  });
});
