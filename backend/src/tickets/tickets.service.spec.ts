import { Test } from '@nestjs/testing';
import { TicketsService } from './tickets.service';
import { TicketEntity } from './entities/ticket.entity';
import { getRepositoryToken } from '@nestjs/typeorm';

import { PaymentsService } from '../payments/payments.service';
import { StellarService } from '../stellar/stellar.service';
import { PaymentStatus } from '../payments/entities/payment.entity';

describe('TicketsService', () => {
  let service: TicketsService;

  const repo = {
    findOne: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ id: 't1', createdAt: new Date(), ...x })),
  };

  const paymentsServiceMock = {
    getPaymentById: jest.fn(),
  };

  const stellarServiceMock = {
    getTransaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(TicketEntity), useValue: repo },

        { provide: PaymentsService, useValue: paymentsServiceMock },
        { provide: 'PaymentsService', useValue: paymentsServiceMock },

        { provide: StellarService, useValue: stellarServiceMock },
        { provide: 'StellarService', useValue: stellarServiceMock },
      ],
    }).compile();

    service = moduleRef.get(TicketsService);
  });

  it('Ticket created only after confirmation', async () => {
    paymentsServiceMock.getPaymentById.mockResolvedValue({
      id: 'p1',
      status: PaymentStatus.PENDING,
      eventId: 'e1',
      userId: 'u1',
      currency: 'USDC',
      transactionHash: 'hash',
    });

    await expect(service.issueTicket('p1')).rejects.toThrow(
      'Payment not confirmed',
    );
  });

  it('Issues ticket when payment confirmed', async () => {
    paymentsServiceMock.getPaymentById.mockResolvedValue({
      id: 'p1',
      status: PaymentStatus.CONFIRMED,
      eventId: 'e1',
      userId: 'u1',
      currency: 'USDC',
      transactionHash: 'hash',
    });

    repo.findOne.mockResolvedValue(null);

    stellarServiceMock.getTransaction.mockResolvedValue({
      memo: 'p1',
      _links: {},
    });

    const ticket = await service.issueTicket('p1');

    expect(stellarServiceMock.getTransaction).toHaveBeenCalledWith('hash');
    expect(ticket.ownerId).toBe('u1');
    expect(ticket.assetCode).toBe('USDC');
    expect(ticket.status).toBe('valid');
    expect(ticket.transactionHash).toBe('hash');
  });

  it('Transfer updates owner', async () => {
    repo.findOne.mockResolvedValue({
      id: 't1',
      ownerId: 'u1',
      status: 'valid',
    });

    const updated = await service.transferTicket('t1', 'u1', 'u2');
    expect(updated.ownerId).toBe('u2');
    expect(repo.save).toHaveBeenCalled();
  });

  it('Invalid transfer rejected', async () => {
    repo.findOne.mockResolvedValue({
      id: 't1',
      ownerId: 'u1',
      status: 'valid',
    });

    await expect(service.transferTicket('t1', 'uX', 'u2')).rejects.toThrow(
      'Not ticket owner',
    );
  });
});
