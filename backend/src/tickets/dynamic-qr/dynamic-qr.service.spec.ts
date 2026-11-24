import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DynamicQrService } from './dynamic-qr.service';
import * as crypto from 'crypto';

describe('DynamicQrService', () => {
  let service: DynamicQrService;
  let mockTicketRepo: any;
  let mockConfig: any;
  let mockRedis: any;

  const mockSecret = 'test_secret_key';

  beforeEach(() => {
    mockTicketRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((ticket) => Promise.resolve(ticket)),
    };
    mockConfig = {
      get: jest.fn().mockReturnValue(mockSecret),
    };
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };

    service = new DynamicQrService(mockTicketRepo, mockConfig, mockRedis);
  });

  describe('validateTimeOtp', () => {
    const ticketId = 'ticket-uuid-123';
    const hmacSecret = crypto
      .createHmac('sha256', mockSecret)
      .update(ticketId)
      .digest();

    it('validates a correct OTP, marks it consumed via SETNX, and flips ticket status to used', async () => {
      const ticket = { id: ticketId, status: 'valid', ownerId: 'user-1' };
      mockTicketRepo.findOne.mockResolvedValue(ticket);

      const now = Date.now();
      const counter = service.getCurrentCounter(now);
      const validOtp = service.generateOtp(counter, hmacSecret);

      const result = await service.validateTimeOtp(ticketId, validOtp, now);

      expect(result.valid).toBe(true);
      expect(result.message).toBe('OTP is valid');
      expect(result.counter).toBe(counter);

      // Verify SETNX with TTL was executed to consume OTP
      expect(mockRedis.set).toHaveBeenCalledWith(
        `ticket:otp-used:${ticketId}:${counter}`,
        '1',
        'EX',
        180,
        'NX',
      );

      // Verify ticket status transitioned to 'used'
      expect(ticket.status).toBe('used');
      expect(mockTicketRepo.save).toHaveBeenCalledWith(ticket);
    });

    it('rejects replay of the same OTP when SETNX indicates it was already consumed', async () => {
      const ticket = { id: ticketId, status: 'valid', ownerId: 'user-1' };
      mockTicketRepo.findOne.mockResolvedValue(ticket);

      // Simulate redis SETNX returning null because key already exists
      mockRedis.set.mockResolvedValue(null);

      const now = Date.now();
      const counter = service.getCurrentCounter(now);
      const validOtp = service.generateOtp(counter, hmacSecret);

      const result = await service.validateTimeOtp(ticketId, validOtp, now);

      expect(result.valid).toBe(false);
      expect(result.message).toBe('OTP has already been used');
      expect(mockTicketRepo.save).not.toHaveBeenCalled();
    });

    it('rejects validation when ticket is already marked used', async () => {
      const ticket = { id: ticketId, status: 'used', ownerId: 'user-1' };
      mockTicketRepo.findOne.mockResolvedValue(ticket);

      const now = Date.now();
      const counter = service.getCurrentCounter(now);
      const validOtp = service.generateOtp(counter, hmacSecret);

      const result = await service.validateTimeOtp(ticketId, validOtp, now);

      expect(result.valid).toBe(false);
      expect(result.message).toBe('Ticket has already been used');
      expect(mockRedis.set).not.toHaveBeenCalled();
      expect(mockTicketRepo.save).not.toHaveBeenCalled();
    });

    it('rejects invalid OTP and increments failed attempt counter in Redis', async () => {
      const ticket = { id: ticketId, status: 'valid', ownerId: 'user-1' };
      mockTicketRepo.findOne.mockResolvedValue(ticket);

      const result = await service.validateTimeOtp(ticketId, '000000');

      expect(result.valid).toBe(false);
      expect(result.message).toBe('Invalid or expired OTP');
      expect(mockRedis.incr).toHaveBeenCalledWith(`rate-limit:otp-attempts:${ticketId}`);
      expect(mockTicketRepo.save).not.toHaveBeenCalled();
    });

    it('blocks brute-force attempts when max failed attempts is reached', async () => {
      mockRedis.get.mockResolvedValue('5'); // 5 failed attempts already

      await expect(
        service.validateTimeOtp(ticketId, '123456', undefined, '192.168.1.10'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when ticket does not exist', async () => {
      mockTicketRepo.findOne.mockResolvedValue(null);

      await expect(service.validateTimeOtp('nonexistent', '123456')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
