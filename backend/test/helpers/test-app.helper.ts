import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { StellarService } from '../../src/stellar/stellar.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { TicketSigningService } from '../../src/tickets/ticket-signing.service';
import { DataSource } from 'typeorm';

/**
 * Mock StellarService — avoids real Horizon calls.
 * Individual tests can override return values via jest.fn().mockResolvedValueOnce().
 */
export function createStellarServiceMock() {
  return {
    getTransaction: jest.fn().mockResolvedValue({
      memo: 'mock-memo',
      _links: { operations: { href: '' } },
    }),
    checkConnectivity: jest.fn().mockResolvedValue(undefined),
    getAccount: jest.fn().mockResolvedValue({}),
    submitTransaction: jest.fn().mockResolvedValue({}),
    streamPayments: jest.fn().mockReturnValue(() => {}),
    generateEscrowKeypair: jest.fn().mockReturnValue({
      publicKey: 'GTEST_ESCROW_PUBLIC',
      secret: 'STEST_ESCROW_SECRET',
    }),
    fundEscrowAccount: jest.fn().mockResolvedValue({}),
    releaseEscrowFunds: jest.fn().mockResolvedValue({}),
    sendPayment: jest.fn().mockResolvedValue({}),
    getXlmBalance: jest.fn().mockResolvedValue('1000.0000000'),
    onModuleDestroy: jest.fn(),
  };
}

/**
 * Mock TicketSigningService — deterministic signer for tests.
 */
export function createTicketSigningServiceMock() {
  return {
    sign: jest.fn().mockImplementation((ticketId: string) => `sig_${ticketId}`),
    verify: jest.fn().mockReturnValue(true),
  };
}

/**
 * Pass-through ThrottlerGuard — disables rate limiting for tests.
 */
class NoOpThrottlerGuard {
  canActivate() {
    return true;
  }
}

/**
 * Bootstrap the full NestJS application for e2e testing with all
 * external dependencies mocked/overridden.
 */
export async function createTestApp(): Promise<{
  app: INestApplication;
  dataSource: DataSource;
  stellarMock: ReturnType<typeof createStellarServiceMock>;
}> {
  const stellarMock = createStellarServiceMock();
  const ticketSigningMock = createTicketSigningServiceMock();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(StellarService)
    .useValue(stellarMock)
    .overrideProvider(TicketSigningService)
    .useValue(ticketSigningMock)
    .overrideGuard(ThrottlerGuard)
    .useClass(NoOpThrottlerGuard)
    .compile();

  const app = moduleFixture.createNestApplication();

  // Mirror the ValidationPipe from main.ts
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.init();

  const dataSource = moduleFixture.get<DataSource>(DataSource);

  return { app, dataSource, stellarMock };
}
