import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { StellarModule } from './stellar/stellar.module';
import { SponsorsModule } from './sponsors/sponsors.module';
import { WalletModule } from './wallet/wallet.module';
import { PaymentsModule } from './payments/payments.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { NotificationModule } from './notifications/notification.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ── Redis-backed rate limiting — shared across all instances ──────────────
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        storage: new ThrottlerStorageRedisService({
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: config.get<number>('REDIS_PORT') ?? 6379,
        }),
      }),
    }),

    // ── Database ──────────────────────────────────────────────────────────────
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
    }),

    // ── Bull / Redis queues ───────────────────────────────────────────────────
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('REDIS_HOST') || 'localhost',
          port: config.get<number>('REDIS_PORT') || 6379,
        },
      }),
    }),

    // ── Feature modules ───────────────────────────────────────────────────────
    UsersModule,
    AuthModule,
    EventsModule,
    StellarModule,
    SponsorsModule,
    WalletModule,
    PaymentsModule,
    AuditModule,
    HealthModule,
    NotificationModule,
    TransactionsModule,
    CurrenciesModule,
    ExchangeRatesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
