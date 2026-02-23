/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UserRole } from './enums/user-role.enum';
import { CurrenciesService } from '../currencies/currencies.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import {
  BalanceEntryDto,
  WalletBalancesResponseDto,
} from './dto/wallet-balances-response.dto';
import {
  PortfolioEntryDto,
  PortfolioResponseDto,
} from './dto/portfolio-response.dto';

const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly currenciesService: CurrenciesService,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  async createUser(
    createUserDto: CreateUserDto,
  ): Promise<Omit<User, 'passwordHash'>> {
    const { email, password, role = UserRole.EVENT_GOER } = createUserDto;

    const existing = await this.usersRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const user = this.usersRepository.create({ email, passwordHash, role });
    const saved = await this.usersRepository.save(user);
    return this.sanitize(saved);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findById(id: string): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return this.sanitize(user);
  }

  async updateWallet(
    userId: string,
    publicKey: string,
  ): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }
    user.stellarPublicKey = publicKey;
    const saved = await this.usersRepository.save(user);
    return this.sanitize(saved);
  }

  // ── Wallet balance endpoints ──────────────────────────────────────────────

  async getWalletBalances(userId: string): Promise<WalletBalancesResponseDto> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    const rawBalances: Record<string, number> = user.balances ?? {};
    const codes = Object.keys(rawBalances);

    if (codes.length === 0) {
      return { balances: [], lastUpdatedAt: null };
    }

    // Single bulk DB call — no N+1
    const currencyMap = await this.currenciesService.findByCodes(codes);

    const balances: BalanceEntryDto[] = codes.map((code) => {
      const meta = currencyMap[code];
      return {
        currency: code,
        amount: rawBalances[code],
        symbol: meta?.symbol ?? code,
        displayName: meta?.displayName ?? code,
      };
    });

    return {
      balances,
      lastUpdatedAt: user.balancesUpdatedAt?.toISOString() ?? null,
    };
  }

  async getPortfolioValue(
    userId: string,
    baseCurrency: string,
  ): Promise<PortfolioResponseDto> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    const rawBalances: Record<string, number> = user.balances ?? {};
    const codes = Object.keys(rawBalances);

    if (codes.length === 0) {
      return { baseCurrency, totalValue: 0, breakdown: [] };
    }

    // Fetch currency metadata and all exchange rates in parallel
    const [currencyMap, rateEntries] = await Promise.all([
      this.currenciesService.findByCodes(codes),
      Promise.all(
        codes.map(async (code) => ({
          code,
          rate:
            code === baseCurrency
              ? 1
              : await this.exchangeRatesService.getRate(code, baseCurrency),
        })),
      ),
    ]);

    const rates = Object.fromEntries(
      rateEntries.map(({ code, rate }) => [code, rate]),
    );

    let totalValue = 0;

    const breakdown: PortfolioEntryDto[] = codes.map((code) => {
      const originalAmount = rawBalances[code];
      const convertedAmount = parseFloat(
        (originalAmount * rates[code]).toFixed(2),
      );
      const meta = currencyMap[code];
      totalValue += convertedAmount;

      return {
        currency: code,
        originalAmount,
        convertedAmount,
        symbol: meta?.symbol ?? code,
        displayName: meta?.displayName ?? code,
      };
    });

    return {
      baseCurrency,
      totalValue: parseFloat(totalValue.toFixed(2)),
      breakdown,
    };
  }

  private sanitize(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }
}
