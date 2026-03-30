import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { CurrenciesService } from '../currencies/currencies.service';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { paginate } from '../common/pagination/pagination.helper';
import { PaginatedResult } from '../common/pagination/interfaces/paginated-result.interface';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,
    private readonly currenciesService: CurrenciesService,
  ) {}

  async findAllByUser(
    userId: string,
    dto: ListTransactionsDto,
  ): Promise<PaginatedResult<TransactionResponseDto>> {
    const qb = this.transactionsRepository
      .createQueryBuilder('tx')
      .where('tx.userId = :userId', { userId });

    if (dto.type) {
      qb.andWhere('tx.type = :type', { type: dto.type });
    }
    if (dto.txStatus) {
      qb.andWhere('tx.status = :status', { status: dto.txStatus });
    }
    if (dto.from) {
      qb.andWhere('tx.createdAt >= :from', { from: dto.from });
    }
    if (dto.to) {
      qb.andWhere('tx.createdAt <= :to', { to: dto.to });
    }

    qb.orderBy('tx.createdAt', 'DESC');

    const paginated = await paginate(qb, dto, 'tx');

    const uniqueCodes = [...new Set(paginated.data.map((t) => t.currency))];
    const currencyMap = await this.currenciesService.findByCodes(uniqueCodes);

    return {
      ...paginated,
      data: paginated.data.map((tx): TransactionResponseDto => {
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
      }),
    };
  }

  async findOneByUser(id: string, userId: string): Promise<TransactionResponseDto> {
    const tx = await this.transactionsRepository.findOne({ where: { id } });
    if (!tx) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }
    if (tx.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    const currencyMap = await this.currenciesService.findByCodes([tx.currency]);
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
  }

  async getAllForExport(
    userId: string,
    from?: string,
    to?: string,
  ): Promise<Transaction[]> {
    const qb = this.transactionsRepository
      .createQueryBuilder('tx')
      .where('tx.userId = :userId', { userId });

    if (from) {
      qb.andWhere('tx.createdAt >= :from', { from });
    }
    if (to) {
      qb.andWhere('tx.createdAt <= :to', { to });
    }

    qb.orderBy('tx.createdAt', 'DESC');

    const count = await qb.getCount();
    if (count > 10_000) {
      throw new BadRequestException(
        'Export exceeds 10,000 rows. Please use a narrower date range.',
      );
    }

    return qb.getMany();
  }
}
