import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { CurrenciesService } from '../currencies/currencies.service';
import { TransactionResponseDto } from './dto/transaction-response.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,
    private readonly currenciesService: CurrenciesService,
  ) {}

  async findAllByUser(userId: string): Promise<TransactionResponseDto[]> {
    const transactions = await this.transactionsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (transactions.length === 0) return [];

    // Collect unique currency codes then do ONE bulk lookup — no N+1
    const uniqueCodes = [...new Set(transactions.map((t) => t.currency))];
    const currencyMap = await this.currenciesService.findByCodes(uniqueCodes);

    return transactions.map((tx): TransactionResponseDto => {
      const meta = currencyMap[tx.currency];
      return {
        id: tx.id,
        userId: tx.userId,
        amount: Number(tx.amount),
        currency: tx.currency,
        currencySymbol: meta?.symbol ?? tx.currency,
        currencyDisplayName: meta?.displayName ?? tx.currency,
        type: tx.type,
        status: tx.status,
        referenceId: tx.referenceId,
        transactionHash: tx.transactionHash,
        createdAt: tx.createdAt,
      };
    });
  }
}
