import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { FraudDetectionService } from './fraud-detection.service';
import { ResaleTransaction } from '../resale-transaction.entity';
import { FraudFlag, FraudReason, FraudRiskLevel } from './fraud-flag.entity';
import { AuditService } from '../../../audit/audit.service';

describe('FraudDetectionService', () => {
  let service: FraudDetectionService;

  const resaleTransactionRepo = {
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const fraudFlagRepo = {
    create: jest.fn((x: Partial<FraudFlag>) => x as FraudFlag),
    save: jest.fn((x: FraudFlag) => ({ ...x, id: 'flag-1', createdAt: new Date() }) as FraudFlag),
    findOne: jest.fn(),
  };

  const auditServiceMock = {
    log: jest.fn(),
  };

  const trade = {
    ticketId: 't1',
    eventId: 'e1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    price: 100,
  };

  const mockQueryBuilder = (avg: string | null) => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ avg }),
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    resaleTransactionRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder('100'));

    const moduleRef = await Test.createTestingModule({
      providers: [
        FraudDetectionService,
        { provide: getRepositoryToken(ResaleTransaction), useValue: resaleTransactionRepo },
        { provide: getRepositoryToken(FraudFlag), useValue: fraudFlagRepo },
        { provide: AuditService, useValue: auditServiceMock },
      ],
    }).compile();

    service = moduleRef.get(FraudDetectionService);
  });

  describe('analyzeTradePatterns', () => {
    it('returns LOW risk for a legitimate trade with no history', async () => {
      resaleTransactionRepo.count.mockResolvedValue(0);
      resaleTransactionRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(null));

      const result = await service.analyzeTradePatterns(trade);

      expect(result.riskLevel).toBe(FraudRiskLevel.LOW);
      expect(result.riskScore).toBe(0);
      expect(result.reasons).toEqual([]);
    });

    it('flags wash trading when the same pair has traded before', async () => {
      resaleTransactionRepo.count.mockImplementation((opts: any) =>
        Array.isArray(opts.where) ? Promise.resolve(2) : Promise.resolve(0),
      );
      resaleTransactionRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(null));

      const result = await service.analyzeTradePatterns(trade);

      expect(result.reasons).toContain(FraudReason.WASH_TRADING);
      expect(result.riskScore).toBeGreaterThanOrEqual(40);
    });

    it('flags bot activity when a buyer trades too frequently', async () => {
      resaleTransactionRepo.count.mockImplementation((opts: any) =>
        Array.isArray(opts.where) ? Promise.resolve(0) : Promise.resolve(5),
      );
      resaleTransactionRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(null));

      const result = await service.analyzeTradePatterns(trade);

      expect(result.reasons).toContain(FraudReason.BOT_ACTIVITY);
    });

    it('flags a price anomaly when price deviates sharply from the average', async () => {
      resaleTransactionRepo.count.mockResolvedValue(0);
      resaleTransactionRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder('20'));

      const result = await service.analyzeTradePatterns({ ...trade, price: 100 });

      expect(result.reasons).toContain(FraudReason.PRICE_ANOMALY);
    });

    it('reaches HIGH risk when multiple rules trigger', async () => {
      resaleTransactionRepo.count.mockResolvedValue(5);
      resaleTransactionRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder('20'));

      const result = await service.analyzeTradePatterns({ ...trade, price: 100 });

      expect(result.riskLevel).toBe(FraudRiskLevel.HIGH);
      expect(result.riskScore).toBeGreaterThanOrEqual(70);
    });
  });

  describe('flagFraudulentTransaction', () => {
    it('places a HIGH risk trade on hold immediately', async () => {
      const analysis = { riskScore: 80, riskLevel: FraudRiskLevel.HIGH, reasons: [FraudReason.WASH_TRADING] };

      const flag = await service.flagFraudulentTransaction(trade, analysis);

      expect(fraudFlagRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ onHold: true, riskLevel: FraudRiskLevel.HIGH }),
      );
      expect(auditServiceMock.log).toHaveBeenCalled();
      expect(flag.id).toBe('flag-1');
    });

    it('does not hold a MEDIUM risk trade', async () => {
      const analysis = { riskScore: 50, riskLevel: FraudRiskLevel.MEDIUM, reasons: [FraudReason.BOT_ACTIVITY] };

      await service.flagFraudulentTransaction(trade, analysis);

      expect(fraudFlagRepo.create).toHaveBeenCalledWith(expect.objectContaining({ onHold: false }));
    });
  });

  describe('evaluateTrade', () => {
    it('does not create a flag for a low-risk trade', async () => {
      resaleTransactionRepo.count.mockResolvedValue(0);
      resaleTransactionRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(null));

      const { analysis, flag } = await service.evaluateTrade(trade);

      expect(analysis.riskLevel).toBe(FraudRiskLevel.LOW);
      expect(flag).toBeNull();
      expect(fraudFlagRepo.create).not.toHaveBeenCalled();
    });

    it('creates a flag for a suspicious trade', async () => {
      resaleTransactionRepo.count.mockResolvedValue(5);
      resaleTransactionRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(null));

      const { analysis, flag } = await service.evaluateTrade(trade);

      expect(analysis.riskLevel).not.toBe(FraudRiskLevel.LOW);
      expect(flag).not.toBeNull();
    });
  });

  describe('holdSuspiciousTrade', () => {
    it('throws when the flag does not exist', async () => {
      fraudFlagRepo.findOne.mockResolvedValue(null);
      await expect(service.holdSuspiciousTrade('missing')).rejects.toThrow(NotFoundException);
    });

    it('marks an existing flag on hold', async () => {
      fraudFlagRepo.findOne.mockResolvedValue({
        id: 'flag-1',
        onHold: false,
        buyerId: 'buyer-1',
        ticketId: 't1',
        riskLevel: FraudRiskLevel.MEDIUM,
      });

      const result = await service.holdSuspiciousTrade('flag-1');

      expect(result.onHold).toBe(true);
      expect(auditServiceMock.log).toHaveBeenCalled();
    });
  });

  describe('releaseTradeHold', () => {
    it('throws when the flag does not exist', async () => {
      fraudFlagRepo.findOne.mockResolvedValue(null);
      await expect(service.releaseTradeHold('missing', 'reviewer-1')).rejects.toThrow(NotFoundException);
    });

    it('releases the hold and marks the flag resolved', async () => {
      fraudFlagRepo.findOne.mockResolvedValue({
        id: 'flag-1',
        onHold: true,
        resolved: false,
        buyerId: 'buyer-1',
        ticketId: 't1',
      });

      const result = await service.releaseTradeHold('flag-1', 'reviewer-1');

      expect(result.onHold).toBe(false);
      expect(result.resolved).toBe(true);
      expect(result.reviewedBy).toBe('reviewer-1');
    });
  });
});
