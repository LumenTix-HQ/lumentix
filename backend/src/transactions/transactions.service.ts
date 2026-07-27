import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { CurrenciesService } from '../currencies/currencies.service';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { StellarTransactionDto } from './dto/stellar-transaction.dto';
import { paginate } from '../common/pagination/pagination.helper';
import { PaginatedResult } from '../common/pagination/interfaces/paginated-result.interface';
import { StellarService } from '../stellar/stellar.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,
    private readonly currenciesService: CurrenciesService,
    private readonly stellarService: StellarService,
    private readonly usersService: UsersService,
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
    if (dto.status) {
      qb.andWhere('tx.status = :status', { status: dto.status });
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

  async getStellarTransactions(
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ data: StellarTransactionDto[]; nextCursor: string | null }> {
    const user = await this.usersService.findById(userId);
    if (!(user as any).stellarPublicKey) {
      return { data: [], nextCursor: null };
    }

    const safeLimit = Math.min(limit, 200);
    const { records } = await this.stellarService.getAccountTransactions(
      (user as any).stellarPublicKey,
      cursor,
      safeLimit,
    );

    const data: StellarTransactionDto[] = records.map((tx: any) => ({
      id: tx.id,
      hash: tx.hash,
      ledger: tx.ledger_attr,
      type: this.deriveTxType(tx),
      amount: this.extractAmount(tx),
      status: tx.successful ? 'confirmed' : 'failed',
      timestamp: tx.created_at,
      fee: tx.fee_charged,
      memo: tx.memo ?? null,
    }));

    const nextCursor =
      records.length === safeLimit
        ? records[records.length - 1]?.paging_token ?? null
        : null;

    return { data, nextCursor };
  }

  private deriveTxType(tx: any): string {
    const memo = typeof tx.memo === 'string' ? tx.memo.toLowerCase() : '';
    if (memo.includes('refund')) return 'refund';
    if (memo.includes('contribution') || memo.includes('sponsor')) return 'contribution';
    return 'payment';
  }

  private extractAmount(tx: any): number | null {
    try {
      const ops = tx._links?.operations?.href;
      return null;
    } catch {
      return null;
    }
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
