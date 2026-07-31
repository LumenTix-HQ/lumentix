import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaxCollectionRecord, TaxReport, TaxRule } from './entities/tax.entity';
import { TaxController } from './tax.controller';
import { TaxService } from './tax.service';

@Module({
  imports: [TypeOrmModule.forFeature([TaxRule, TaxCollectionRecord, TaxReport])],
  controllers: [TaxController],
  providers: [TaxService],
  exports: [TaxService],
})
export class TaxModule {}
