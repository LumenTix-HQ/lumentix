import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

const mockPaymentsService = {
  getHistory: jest.fn(),
  getPending: jest.fn(),
  createPaymentIntent: jest.fn(),
  confirmPayment: jest.fn(),
  getPaymentById: jest.fn(),
};

const mockUser = { id: 'user-1', email: 'user@test.com' };
const mockReq = { user: mockUser };

describe('PaymentsController', () => {
  let controller: PaymentsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: mockPaymentsService },
      ],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── GET /payments/history ────────────────────────────────────────────────

  describe('GET /payments/history', () => {
    it('calls PaymentsService.getHistory with userId and pagination dto', async () => {
      const paginatedResult = { data: [], total: 0, page: 1, limit: 10 };
      mockPaymentsService.getHistory.mockResolvedValue(paginatedResult);

      const dto = { page: 1, limit: 10 };
      const result = await controller.getHistory(mockReq as any, dto as any);

      expect(mockPaymentsService.getHistory).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(paginatedResult);
    });

    it('returns paginated payment history', async () => {
      const payments = [
        { id: 'pay-1', status: 'confirmed', amount: 10 },
        { id: 'pay-2', status: 'refunded', amount: 5 },
      ];
      mockPaymentsService.getHistory.mockResolvedValue({
        data: payments,
        total: 2,
        page: 1,
        limit: 10,
      });

      const result = await controller.getHistory(mockReq as any, {} as any);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  // ─── GET /payments/pending ────────────────────────────────────────────────

  describe('GET /payments/pending', () => {
    it('calls PaymentsService.getPending with userId and pagination dto', async () => {
      const paginatedResult = { data: [], total: 0, page: 1, limit: 10 };
      mockPaymentsService.getPending.mockResolvedValue(paginatedResult);

      const dto = { page: 1, limit: 10 };
      const result = await controller.getPending(mockReq as any, dto as any);

      expect(mockPaymentsService.getPending).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(paginatedResult);
    });

    it('returns only pending payments', async () => {
      const pending = [{ id: 'pay-3', status: 'pending', amount: 20 }];
      mockPaymentsService.getPending.mockResolvedValue({
        data: pending,
        total: 1,
        page: 1,
        limit: 10,
      });

      const result = await controller.getPending(mockReq as any, {} as any);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('pending');
    });
  });
});
