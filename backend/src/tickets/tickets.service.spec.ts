import { Test } from '@nestjs/testing';
import { TicketsService } from './tickets.service';
import { TicketEntity } from './entities/ticket.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as crypto from 'crypto';

import { PaymentsService } from '../payments/payments.service';
import { StellarService } from '../stellar/stellar.service';
import { PaymentStatus } from '../payments/entities/payment.entity';
import { ConfigService } from '@nestjs/config';
import { TicketSigningService } from './ticket-signing.service';
import { NotificationService } from '../notifications/notification.service';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';

describe('TicketsService', () => {
  let service: TicketsService;

  const repo = {
    findOne: jest.fn(),
    create: jest.fn((x: TicketEntity) => x),
    save: jest.fn(
      (x: TicketEntity) =>
        ({
          ...x,
          id: 't1',
          createdAt: new Date(),
        }) as TicketEntity,
    ),
  };

  const paymentsServiceMock = {
    getPaymentById: jest.fn(),
  };

  const stellarServiceMock = {
    getTransaction: jest.fn(),
    buildTicketTransferXdr: jest.fn(),
    getTransactionOperations: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn(),
  };

  const commonProviders = [
    TicketsService,
    { provide: getRepositoryToken(TicketEntity), useValue: repo },
    { provide: PaymentsService, useValue: paymentsServiceMock },
    { provide: StellarService, useValue: stellarServiceMock },
    { provide: ConfigService, useValue: configServiceMock },
    {
      provide: TicketSigningService,
      useValue: { sign: jest.fn(), verify: jest.fn() },
    },
    {
      provide: NotificationService,
      useValue: { queueTicketEmail: jest.fn() },
    },
    { provide: getRepositoryToken(Event), useValue: { findOne: jest.fn() } },
    { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: commonProviders,
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

  describe('verifyTicket', () => {
    // Generate a real throwaway keypair so tests are self-contained
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const privatePem = privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }) as string;
    const publicPem = publicKey.export({
      type: 'spki',
      format: 'pem',
    }) as string;

    const myConfigServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'TICKET_SIGNING_PRIVATE_KEY') return privatePem;
        if (key === 'TICKET_SIGNING_PUBLIC_KEY') return publicPem;
        return undefined;
      }),
    };

    beforeEach(async () => {
      jest.clearAllMocks();

      const moduleRef = await Test.createTestingModule({
        providers: [
          TicketsService,
          { provide: getRepositoryToken(TicketEntity), useValue: repo },
          { provide: PaymentsService, useValue: paymentsServiceMock },
          { provide: StellarService, useValue: stellarServiceMock },
          { provide: ConfigService, useValue: myConfigServiceMock },
          {
            provide: TicketSigningService,
            useValue: { sign: jest.fn(), verify: jest.fn() },
          },
          {
            provide: NotificationService,
            useValue: { queueTicketEmail: jest.fn() },
          },
          {
            provide: getRepositoryToken(Event),
            useValue: { findOne: jest.fn() },
          },
          {
            provide: getRepositoryToken(User),
            useValue: { findOne: jest.fn() },
          },
        ],
      }).compile();

      service = moduleRef.get(TicketsService);
    });

    function makeSignature(ticketId: string): string {
      const signer = crypto.createSign('SHA256');
      signer.update(ticketId);
      signer.end();
      return signer.sign(privatePem, 'hex');
    }

    it('marks ticket as used when signature is valid', async () => {
      const ticketId = 'ticket-uuid-1234';
      const signature = makeSignature(ticketId);

      repo.findOne.mockResolvedValue({ id: ticketId, status: 'valid' });
      // override verify
      jest
        .spyOn(
          service['ticketSigningService'] as unknown as TicketSigningService,
          'verify',
        )
        .mockReturnValue(true);

      const result = await service.verifyTicket(ticketId, signature);
      expect(result.status).toBe('used');
      expect(repo.save).toHaveBeenCalled();
    });

    it('rejects an arbitrary truthy string as signature', async () => {
      jest
        .spyOn(
          service['ticketSigningService'] as unknown as TicketSigningService,
          'verify',
        )
        .mockReturnValue(false);
      await expect(
        service.verifyTicket('ticket-uuid-1234', 'not-a-real-signature'),
      ).rejects.toThrow('Invalid ticket signature');
    });

    it('rejects a valid signature for a different ticketId', async () => {
      jest
        .spyOn(
          service['ticketSigningService'] as unknown as TicketSigningService,
          'verify',
        )
        .mockReturnValue(false);
      const signature = makeSignature('other-ticket-id');
      await expect(
        service.verifyTicket('ticket-uuid-1234', signature),
      ).rejects.toThrow('Invalid ticket signature');
    });

    it('rejects a used ticket even with a valid signature', async () => {
      const ticketId = 'ticket-uuid-used';
      const signature = makeSignature(ticketId);

      repo.findOne.mockResolvedValue({ id: ticketId, status: 'used' });
      jest
        .spyOn(
          service['ticketSigningService'] as unknown as TicketSigningService,
          'verify',
        )
        .mockReturnValue(true);

      await expect(service.verifyTicket(ticketId, signature)).rejects.toThrow(
        'Ticket has already been used',
      );
    });
  });

  describe('initiateTransfer', () => {
    it('should return an XDR for a valid transfer', async () => {
      repo.findOne.mockResolvedValue({
        id: 't1',
        ownerId: 'u1',
        status: 'valid',
        ownerPublicKey: 'GAUCTION_OWNER',
        assetCode: 'TICKET',
        eventId: 'e1',
      });
      jest.spyOn(service['eventRepo'], 'findOne').mockResolvedValue({
        id: 'e1',
        startDate: new Date('2099-01-01'),
        escrowPublicKey: 'GESCROW',
      });
      jest.spyOn(service['userRepo'], 'findOne').mockResolvedValue({
        id: 'u2',
        stellarPublicKey: 'GRECIPIENT',
      });
      stellarServiceMock.buildTicketTransferXdr.mockResolvedValue('xdr_string');

      const result = await service.initiateTransfer('t1', 'u1', {
        recipientUserId: 'u2',
        recipientPublicKey: 'GRECIPIENT',
      });

      expect(result).toEqual({ xdr: 'xdr_string' });
    });
  });

  describe('confirmTransfer', () => {
    const validTicket = {
      id: 't1',
      ownerId: 'u1',
      ownerPublicKey: 'GOWNER',
      status: 'valid',
      assetCode: 'TICKET',
      eventId: 'e1',
      transferHistory: [{ to: 'u2' }],
    };
    const validEvent = { id: 'e1', escrowPublicKey: 'GESCROW' };
    const validRecipient = { id: 'u2', stellarPublicKey: 'GRECIPIENT' };
    const validOp = {
      type: 'payment',
      asset_code: 'TICKET',
      asset_issuer: 'GESCROW',
      to: 'GRECIPIENT',
      from: 'GOWNER',
      amount: '0.0000001',
    };

    beforeEach(() => {
      repo.findOne.mockResolvedValue(validTicket);
      jest.spyOn(service['eventRepo'], 'findOne').mockResolvedValue(validEvent);
      jest.spyOn(service['userRepo'], 'findOne').mockResolvedValue(validRecipient);
      stellarServiceMock.getTransaction.mockResolvedValue({ id: 'tx_hash' });
      stellarServiceMock.getTransactionOperations.mockResolvedValue([validOp]);
      repo.save.mockImplementation((ticket) => Promise.resolve(ticket));
    });

    it('should transfer a ticket after a valid on-chain transaction', async () => {
      const result = await service.confirmTransfer('t1', 'u1', {
        transactionHash: 'tx_hash',
      });

      expect(result.ownerId).toBe('u2');
      expect(result.ownerPublicKey).toBe('GRECIPIENT');
    });

    it('should reject a transaction with multiple operations', async () => {
      stellarServiceMock.getTransactionOperations.mockResolvedValue([validOp, validOp]);
      await expect(
        service.confirmTransfer('t1', 'u1', { transactionHash: 'tx_hash' }),
      ).rejects.toThrow('Transaction must have exactly one operation.');
    });

    it('should reject a transaction that is not a payment', async () => {
      stellarServiceMock.getTransactionOperations.mockResolvedValue([
        { ...validOp, type: 'createAccount' },
      ]);
      await expect(
        service.confirmTransfer('t1', 'u1', { transactionHash: 'tx_hash' }),
      ).rejects.toThrow('Transaction must be a payment operation.');
    });

    it('should reject a transaction with the wrong asset code', async () => {
      stellarServiceMock.getTransactionOperations.mockResolvedValue([
        { ...validOp, asset_code: 'WRONG' },
      ]);
      await expect(
        service.confirmTransfer('t1', 'u1', { transactionHash: 'tx_hash' }),
      ).rejects.toThrow('Transaction asset code does not match ticket.');
    });

    it('should reject a transaction with the wrong asset issuer', async () => {
      stellarServiceMock.getTransactionOperations.mockResolvedValue([
        { ...validOp, asset_issuer: 'WRONG' },
      ]);
      await expect(
        service.confirmTransfer('t1', 'u1', { transactionHash: 'tx_hash' }),
      ).rejects.toThrow('Transaction asset issuer does not match event escrow.');
    });

    it('should reject a transaction to the wrong recipient', async () => {
      stellarServiceMock.getTransactionOperations.mockResolvedValue([
        { ...validOp, to: 'WRONG' },
      ]);
      await expect(
        service.confirmTransfer('t1', 'u1', { transactionHash: 'tx_hash' }),
      ).rejects.toThrow('Transaction destination does not match recipient.');
    });

    it('should reject a transaction from the wrong source', async () => {
      stellarServiceMock.getTransactionOperations.mockResolvedValue([
        { ...validOp, from: 'WRONG' },
      ]);
      await expect(
        service.confirmTransfer('t1', 'u1', { transactionHash: 'tx_hash' }),
      ).rejects.toThrow('Transaction source does not match original owner.');
    });

    it('should reject a transaction with the wrong amount', async () => {
      stellarServiceMock.getTransactionOperations.mockResolvedValue([
        { ...validOp, amount: '1.0' },
      ]);
      await expect(
        service.confirmTransfer('t1', 'u1', { transactionHash: 'tx_hash' }),
      ).rejects.toThrow('Transaction amount is incorrect for a ticket transfer.');
    });
  });
});