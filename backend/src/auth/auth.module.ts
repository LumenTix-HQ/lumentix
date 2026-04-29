// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { BruteForceService } from '../common/services/brute-force.service';
import { BruteForceGuard } from '../common/guards/brute-force.guard';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { MailerModule } from '../mailer/mailer.module';
import type { StringValue } from 'ms';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([PasswordResetToken, RefreshToken]),
    MailerModule,
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>(
            'JWT_EXPIRES_IN',
            '7d',
          ) as StringValue,
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, BruteForceService, BruteForceGuard],
  exports: [BruteForceService, BruteForceGuard],
  controllers: [AuthController],
})
export class AuthModule {}
