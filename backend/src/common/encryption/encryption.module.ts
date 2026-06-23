import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  EncryptionService,
  ENCRYPTION_PROVIDER,
} from './encryption.service';
import { LocalEncryptionProvider } from './providers/local-encryption.provider';
import { EncryptionProvider } from './interfaces/encryption-provider.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: ENCRYPTION_PROVIDER,
      useFactory: (configService: ConfigService): EncryptionProvider => {
        // In production, conditionally return a KMS-based provider here.
        // For now, always use LocalEncryptionProvider.
        return new LocalEncryptionProvider(configService);
      },
      inject: [ConfigService],
    },
    EncryptionService,
  ],
  exports: [EncryptionService],
})
export class EncryptionModule {}
