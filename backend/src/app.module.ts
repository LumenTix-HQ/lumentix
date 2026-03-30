import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envValidationSchema } from './config/env.validation';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import Redis from 'ioredis';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
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
import { TicketsModule } from './tickets/tickets.module';
import { AdminModule } from './admin/admin.module';
import { RegistrationsModule } from './registrations/registrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),

    // ── Redis-backed rate limiting — shared across all instances ──────────────
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          { name: 'short', ttl: seconds(1), limit: 3 }, // 3 req/sec
          { name: 'medium', ttl: seconds(10), limit: 20 }, // 20 req/10sec
          { name: 'long', ttl: seconds(60), limit: 100 }, // 100 req/min
        ],
        storage: new ThrottlerStorageRedisService(
          new Redis({
            host: config.get<string>('REDIS_HOST') ?? 'localhost',
            port: config.get<number>('REDIS_PORT') ?? 6379,
          }),
        ),
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

    // ── Scheduled tasks ───────────────────────────────────────────────────────
    ScheduleModule.forRoot(),
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
    TicketsModule,
    AdminModule,
    RegistrationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
