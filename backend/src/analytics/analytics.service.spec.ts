import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Event } from '../events/entities/event.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { Registration, RegistrationStatus } from '../registrations/entities/registration.entity';
import { AgeVerification } from '../age-verification/entities/age-verification.entity';
import { User } from '../users/entities/user.entity';

describe('AnalyticsService', () => {
	let service: AnalyticsService;
	let eventRepo: any;
	let ticketRepo: any;
	let paymentRepo: any;
	let registrationRepo: any;
	let ageVerificationRepo: any;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AnalyticsService,
				{
					provide: getRepositoryToken(Event),
					useValue: { findOne: jest.fn() },
				},
				{
					provide: getRepositoryToken(TicketEntity),
					useValue: { find: jest.fn() },
				},
				{
					provide: getRepositoryToken(Payment),
					useValue: { find: jest.fn() },
				},
				{
					provide: getRepositoryToken(Registration),
					useValue: { find: jest.fn(), createQueryBuilder: jest.fn() },
				},
				{
					provide: getRepositoryToken(AgeVerification),
					useValue: { find: jest.fn() },
				},
				{
					provide: getRepositoryToken(User),
					useValue: {},
				},
			],
		}).compile();

		service = module.get<AnalyticsService>(AnalyticsService);
		eventRepo = module.get(getRepositoryToken(Event));
		ticketRepo = module.get(getRepositoryToken(TicketEntity));
		paymentRepo = module.get(getRepositoryToken(Payment));
		registrationRepo = module.get(getRepositoryToken(Registration));
		ageVerificationRepo = module.get(getRepositoryToken(AgeVerification));
	});

	it('generates a sales report for an organizer event', async () => {
		eventRepo.findOne.mockResolvedValue({
			id: 'event-1',
			organizerId: 'org-1',
			createdAt: new Date('2026-04-01T00:00:00.000Z'),
		});

		paymentRepo.find.mockResolvedValue([
			{ id: 'p1', amount: 100, createdAt: new Date('2026-04-01T01:00:00.000Z'), status: PaymentStatus.CONFIRMED },
			{ id: 'p2', amount: 200, createdAt: new Date('2026-04-02T01:00:00.000Z'), status: PaymentStatus.CONFIRMED },
		]);

		const report = await service.generateSalesReport('event-1', 'org-1');

		expect(report.totalTicketsSold).toBe(2);
		expect(report.totalRevenue).toBe(300);
		expect(report.avgTicketPrice).toBe(150);
		expect(report.salesData.length).toBe(2);
		expect(report.metrics.ticketsLast24Hours).toBeDefined();
	});

	it('calculates demographic statistics for event attendees', async () => {
		eventRepo.findOne.mockResolvedValue({
			id: 'event-1',
			organizerId: 'org-1',
		});

		registrationRepo.find.mockResolvedValue([
			{ userId: 'user-1', eventId: 'event-1', status: RegistrationStatus.CONFIRMED },
			{ userId: 'user-2', eventId: 'event-1', status: RegistrationStatus.PENDING },
		]);

		const mockQueryBuilder = {
			select: jest.fn().mockReturnThis(),
			addSelect: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			andWhere: jest.fn().mockReturnThis(),
			groupBy: jest.fn().mockReturnThis(),
			having: jest.fn().mockReturnThis(),
			getRawMany: jest.fn().mockResolvedValue([]),
		};
		registrationRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

		ageVerificationRepo.find.mockResolvedValue([
			{ status: 'verified', dateOfBirth: '2000-01-01', eventId: 'event-1' },
			{ status: 'failed', dateOfBirth: '2010-01-01', eventId: 'event-1' },
		]);

		paymentRepo.find.mockResolvedValue([
			{ amount: 100, currency: 'USD', status: PaymentStatus.CONFIRMED },
			{ amount: 10, currency: 'XLM', status: PaymentStatus.CONFIRMED },
		]);

		const demographics = await service.trackDemographicData('event-1', 'org-1');

		expect(demographics.totalAttendees).toBe(2);
		expect(demographics.currencyBreakdown).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ currency: 'USD', ticketCount: 1 }),
				expect.objectContaining({ currency: 'XLM', ticketCount: 1 }),
			]),
		);
	});

	it('returns null when no attendance check-ins have occurred', async () => {
		eventRepo.findOne.mockResolvedValue({
			id: 'event-1',
			organizerId: 'org-1',
			startDate: new Date('2026-04-01T10:00:00.000Z'),
		});

		ticketRepo.find.mockResolvedValueOnce([]);

		const attendance = await service.analyzeAttendancePatterns('event-1', 'org-1');

		expect(attendance).toBeNull();
	});
});
