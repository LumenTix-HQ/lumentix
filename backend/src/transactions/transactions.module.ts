import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { CurrenciesModule } from '../currencies/currencies.module';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction]), CurrenciesModule],
  providers: [TransactionsService],
  controllers: [TransactionsController],
  exports: [TransactionsService],
})
export class TransactionsModule {}
