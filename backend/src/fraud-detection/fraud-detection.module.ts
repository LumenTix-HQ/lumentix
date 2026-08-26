import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlaggedTransaction } from './entities/flagged-transaction.entity';
import { FraudDetectionService } from './fraud-detection.service';
import { FraudDetectionController } from './fraud-detection.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FlaggedTransaction])],
  providers: [FraudDetectionService],
  controllers: [FraudDetectionController],
  exports: [FraudDetectionService],
})
export class FraudDetectionModule {}
