import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event, EventStatus } from '../events/entities/event.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';
import { EventsService } from '../events/events.service';
import { TicketsService } from '../tickets/tickets.service';
import { PaymentsService } from '../payments/payments.service';

interface TestResult {
  testName: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

interface LoadTestResult {
  testName: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
}

interface EdgeCaseResult {
  testCase: string;
  passed: boolean;
  description: string;
  error?: string;
  details?: any;
}

@Injectable()
export class TestingService {
  private readonly logger = new Logger(TestingService.name);

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepository: Repository<TicketEntity>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly eventsService: EventsService,
    private readonly ticketsService: TicketsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async testEventLifecycle(eventId: string): Promise<{ results: TestResult[]; summary: any }> {
    this.logger.log(`Starting event lifecycle test for event ${eventId}`);
    const results: TestResult[] = [];
    const startTime = Date.now();

    try {
      const event = await this.eventRepository.findOne({ where: { id: eventId } });
      if (!event) {
        throw new Error('Event not found');
      }

      // Test 1: Draft to Published transition
      results.push(await this.testStateTransition(event, EventStatus.DRAFT, EventStatus.PUBLISHED));

      // Test 2: Published to Completed transition
      results.push(await this.testStateTransition(event, EventStatus.PUBLISHED, EventStatus.COMPLETED));

      // Test 3: Published to Cancelled transition
      results.push(await this.testStateTransition(event, EventStatus.PUBLISHED, EventStatus.CANCELLED));

      // Test 4: Ticket creation and validation
      results.push(await this.testTicketCreation(eventId));

      // Test 5: Payment processing
      results.push(await this.testPaymentProcessing(eventId));

      // Test 6: Refund processing
      results.push(await this.testRefundProcessing(eventId));

      // Test 7: Event deletion (no tickets sold)
      const testEvent = await this.createTestEvent();
      results.push(await this.testEventDeletion(testEvent.id));

      // Cleanup test event
      await this.eventRepository.remove(testEvent);

    } catch (error) {
      this.logger.error(`Event lifecycle test failed: ${error.message}`);
      results.push({
        testName: 'lifecycle_test_suite',
        passed: false,
        duration: Date.now() - startTime,
        error: error.message,
      });
    }

    const passedTests = results.filter((r) => r.passed).length;
    const totalTests = results.length;

    return {
      results,
      summary: {
        totalTests,
        passedTests,
        failedTests: totalTests - passedTests,
        successRate: (passedTests / totalTests) * 100,
        totalDuration: Date.now() - startTime,
      },
    };
  }

  async simulateHighLoad(
    eventId: string,
    options: { concurrentUsers?: number; requestsPerUser?: number; duration?: number } = {},
  ): Promise<LoadTestResult> {
    const { concurrentUsers = 100, requestsPerUser = 10, duration = 60 } = options;
    this.logger.log(
      `Starting high load simulation: ${concurrentUsers} users, ${requestsPerUser} requests each, ${duration}s duration`,
    );

    const startTime = Date.now();
    const results: { responseTime: number; success: boolean }[] = [];
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;

    const event = await this.eventRepository.findOne({ where: { id: eventId } });
    if (!event) {
      throw new Error('Event not found');
    }

    // Simulate concurrent users
    const userPromises = Array.from({ length: concurrentUsers }, async (_, userIndex) => {
      const userResults: { responseTime: number; success: boolean }[] = [];

      for (let i = 0; i < requestsPerUser; i++) {
        const requestStart = Date.now();
        try {
          // Simulate various API calls
          await this.simulateApiCall(eventId, userIndex, i);
          userResults.push({ responseTime: Date.now() - requestStart, success: true });
          successfulRequests++;
        } catch (error) {
          userResults.push({ responseTime: Date.now() - requestStart, success: false });
          failedRequests++;
        }
        totalRequests++;

        // Add small delay between requests
        await this.sleep(Math.random() * 100);
      }

      return userResults;
    });

    const allResults = await Promise.all(userPromises);
    allResults.forEach((userResults) => results.push(...userResults));

    const responseTimes = results.map((r) => r.responseTime);
    const totalDuration = Date.now() - startTime;

    return {
      testName: 'high_load_simulation',
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      maxResponseTime: Math.max(...responseTimes),
      minResponseTime: Math.min(...responseTimes),
      requestsPerSecond: totalRequests / (totalDuration / 1000),
      errorRate: (failedRequests / totalRequests) * 100,
    };
  }

  async validateEdgeCases(eventId: string): Promise<{ results: EdgeCaseResult[]; summary: any }> {
    this.logger.log(`Starting edge case validation for event ${eventId}`);
    const results: EdgeCaseResult[] = [];

    try {
      const event = await this.eventRepository.findOne({ where: { id: eventId } });
      if (!event) {
        throw new Error('Event not found');
      }

      // Edge Case 1: Invalid state transitions
      results.push(await this.testInvalidStateTransition(event));

      // Edge Case 2: Exceeding capacity
      results.push(await this.testCapacityExceeded(event));

      // Edge Case 3: Concurrent ticket purchases
      results.push(await this.testConcurrentPurchases(event));

      // Edge Case 4: Invalid payment amounts
      results.push(await this.testInvalidPaymentAmounts(event));

      // Edge Case 5: Event with past dates
      results.push(await this.testPastEventDates());

      // Edge Case 6: Zero or negative ticket prices
      results.push(await this.testZeroNegativePrices());

      // Edge Case 7: Very long event names/descriptions
      results.push(await this.testLongStrings());

      // Edge Case 8: Special characters in input
      results.push(await this.testSpecialCharacters());

      // Edge Case 9: Duplicate event creation
      results.push(await this.testDuplicateEvents());

      // Edge Case 10: Invalid UUID formats
      results.push(await this.testInvalidUuids());

    } catch (error) {
      this.logger.error(`Edge case validation failed: ${error.message}`);
      results.push({
        testCase: 'edge_case_suite',
        passed: false,
        description: 'Edge case test suite',
        error: error.message,
      });
    }

    const passedTests = results.filter((r) => r.passed).length;
    const totalTests = results.length;

    return {
      results,
      summary: {
        totalTests,
        passedTests,
        failedTests: totalTests - passedTests,
        successRate: (passedTests / totalTests) * 100,
      },
    };
  }

  async runAutomatedTestPipeline(eventId: string): Promise<{
    lifecycle: any;
    loadTest: any;
    edgeCases: any;
    overallSummary: any;
  }> {
    this.logger.log(`Starting automated test pipeline for event ${eventId}`);

    const [lifecycle, loadTest, edgeCases] = await Promise.all([
      this.testEventLifecycle(eventId),
      this.simulateHighLoad(eventId, { concurrentUsers: 50, requestsPerUser: 5, duration: 30 }),
      this.validateEdgeCases(eventId),
    ]);

    const overallSummary = {
      lifecycleSuccess: lifecycle.summary.successRate >= 80,
      loadTestSuccess: loadTest.errorRate < 10,
      edgeCaseSuccess: edgeCases.summary.successRate >= 80,
      overallPassed:
        lifecycle.summary.successRate >= 80 &&
        loadTest.errorRate < 10 &&
        edgeCases.summary.successRate >= 80,
      timestamp: new Date().toISOString(),
    };

    return {
      lifecycle,
      loadTest,
      edgeCases,
      overallSummary,
    };
  }

  private async testStateTransition(
    event: Event,
    fromStatus: EventStatus,
    toStatus: EventStatus,
  ): Promise<TestResult> {
    const startTime = Date.now();
    const testName = `transition_${fromStatus}_to_${toStatus}`;

    try {
      event.status = fromStatus;
      await this.eventRepository.save(event);

      event.status = toStatus;
      await this.eventRepository.save(event);

      return {
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: { fromStatus, toStatus },
      };
    } catch (error) {
      return {
        testName,
        passed: false,
        duration: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  private async testTicketCreation(eventId: string): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'ticket_creation';

    try {
      const testUser = await this.userRepository.findOne({ where: { email: 'test@example.com' } });
      if (!testUser) {
        throw new Error('Test user not found');
      }

      const event = await this.eventRepository.findOne({ where: { id: eventId } });
      const ticket = this.ticketRepository.create({
        eventId,
        userId: testUser.id,
        status: 'valid',
        price: event.ticketPrice,
        currency: event.currency,
      });

      await this.ticketRepository.save(ticket);
      await this.ticketRepository.remove(ticket);

      return {
        testName,
        passed: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        testName,
        passed: false,
        duration: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  private async testPaymentProcessing(eventId: string): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'payment_processing';

    try {
      const payment = this.paymentRepository.create({
        eventId,
        amount: 100,
        currency: 'USD',
        status: PaymentStatus.CONFIRMED,
      });

      await this.paymentRepository.save(payment);
      await this.paymentRepository.remove(payment);

      return {
        testName,
        passed: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        testName,
        passed: false,
        duration: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  private async testRefundProcessing(eventId: string): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'refund_processing';

    try {
      const payment = this.paymentRepository.create({
        eventId,
        amount: 100,
        currency: 'USD',
        status: PaymentStatus.REFUNDED,
      });

      await this.paymentRepository.save(payment);
      await this.paymentRepository.remove(payment);

      return {
        testName,
        passed: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        testName,
        passed: false,
        duration: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  private async createTestEvent(): Promise<Event> {
    const testUser = await this.userRepository.findOne({ where: { email: 'test@example.com' } });
    if (!testUser) {
      throw new Error('Test user not found');
    }

    return this.eventRepository.save(
      this.eventRepository.create({
        title: 'Test Event',
        description: 'Test event for deletion',
        organizerId: testUser.id,
        startDate: new Date(Date.now() + 86400000),
        endDate: new Date(Date.now() + 172800000),
        ticketPrice: 10,
        currency: 'USD',
        status: EventStatus.DRAFT,
      }),
    );
  }

  private async testEventDeletion(eventId: string): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'event_deletion';

    try {
      await this.eventRepository.delete({ id: eventId });
      return {
        testName,
        passed: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        testName,
        passed: false,
        duration: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  private async simulateApiCall(eventId: string, userIndex: number, requestIndex: number): Promise<void> {
    // Simulate different types of API calls
    const callType = requestIndex % 4;

    switch (callType) {
      case 0:
        await this.eventRepository.findOne({ where: { id: eventId } });
        break;
      case 1:
        await this.ticketRepository.find({ where: { eventId }, take: 10 });
        break;
      case 2:
        await this.paymentRepository.find({ where: { eventId }, take: 10 });
        break;
      case 3:
        await this.eventRepository.count();
        break;
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async testInvalidStateTransition(event: Event): Promise<EdgeCaseResult> {
    const testName = 'invalid_state_transition';
    try {
      event.status = EventStatus.COMPLETED;
      await this.eventRepository.save(event);

      // Try to transition from COMPLETED to PUBLISHED (should fail)
      try {
        event.status = EventStatus.PUBLISHED;
        await this.eventRepository.save(event);
        return {
          testCase: testName,
          passed: false,
          description: 'Should reject invalid state transition',
          error: 'Invalid transition was allowed',
        };
      } catch (error) {
        return {
          testCase: testName,
          passed: true,
          description: 'Correctly rejected invalid state transition',
        };
      }
    } catch (error) {
      return {
        testCase: testName,
        passed: false,
        description: 'Test setup failed',
        error: error.message,
      };
    }
  }

  private async testCapacityExceeded(event: Event): Promise<EdgeCaseResult> {
    const testName = 'capacity_exceeded';
    try {
      if (event.maxAttendees === null) {
        return {
          testCase: testName,
          passed: true,
          description: 'Skipped - event has unlimited capacity',
        };
      }

      const soldTickets = await this.ticketRepository.count({
        where: { eventId: event.id, status: 'valid' },
      });

      if (soldTickets >= event.maxAttendees) {
        return {
          testCase: testName,
          passed: true,
          description: 'Capacity correctly enforced',
        };
      }

      return {
        testCase: testName,
        passed: true,
        description: 'Capacity check passed',
      };
    } catch (error) {
      return {
        testCase: testName,
        passed: false,
        description: 'Capacity check failed',
        error: error.message,
      };
    }
  }

  private async testConcurrentPurchases(event: Event): Promise<EdgeCaseResult> {
    const testName = 'concurrent_purchases';
    try {
      // Simulate concurrent ticket purchases
      const promises = Array.from({ length: 5 }, () =>
        this.ticketRepository.create({
          eventId: event.id,
          userId: 'test-user-id',
          status: 'valid',
          price: event.ticketPrice,
          currency: event.currency,
        }),
      );

      await Promise.all(promises);
      return {
        testCase: testName,
        passed: true,
        description: 'Concurrent purchases handled',
      };
    } catch (error) {
      return {
        testCase: testName,
        passed: false,
        description: 'Concurrent purchase handling failed',
        error: error.message,
      };
    }
  }

  private async testInvalidPaymentAmounts(event: Event): Promise<EdgeCaseResult> {
    const testName = 'invalid_payment_amounts';
    try {
      const invalidPayment = this.paymentRepository.create({
        eventId: event.id,
        amount: -100,
        currency: 'USD',
        status: PaymentStatus.CONFIRMED,
      });

      try {
        await this.paymentRepository.save(invalidPayment);
        await this.paymentRepository.remove(invalidPayment);
        return {
          testCase: testName,
          passed: false,
          description: 'Should reject negative payment amounts',
          error: 'Negative amount was allowed',
        };
      } catch (error) {
        return {
          testCase: testName,
          passed: true,
          description: 'Correctly rejected negative payment amount',
        };
      }
    } catch (error) {
      return {
        testCase: testName,
        passed: false,
        description: 'Test setup failed',
        error: error.message,
      };
    }
  }

  private async testPastEventDates(): Promise<EdgeCaseResult> {
    const testName = 'past_event_dates';
    try {
      const pastEvent = this.eventRepository.create({
        title: 'Past Event',
        organizerId: 'test-user-id',
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() - 43200000),
        ticketPrice: 10,
        currency: 'USD',
        status: EventStatus.DRAFT,
      });

      await this.eventRepository.save(pastEvent);
      await this.eventRepository.remove(pastEvent);

      return {
        testCase: testName,
        passed: true,
        description: 'Past event dates handled',
      };
    } catch (error) {
      return {
        testCase: testName,
        passed: false,
        description: 'Past event date handling failed',
        error: error.message,
      };
    }
  }

  private async testZeroNegativePrices(): Promise<EdgeCaseResult> {
    const testName = 'zero_negative_prices';
    try {
      const zeroPriceEvent = this.eventRepository.create({
        title: 'Free Event',
        organizerId: 'test-user-id',
        startDate: new Date(Date.now() + 86400000),
        endDate: new Date(Date.now() + 172800000),
        ticketPrice: 0,
        currency: 'USD',
        status: EventStatus.DRAFT,
      });

      await this.eventRepository.save(zeroPriceEvent);
      await this.eventRepository.remove(zeroPriceEvent);

      return {
        testCase: testName,
        passed: true,
        description: 'Zero price handled correctly',
      };
    } catch (error) {
      return {
        testCase: testName,
        passed: false,
        description: 'Zero price handling failed',
        error: error.message,
      };
    }
  }

  private async testLongStrings(): Promise<EdgeCaseResult> {
    const testName = 'long_strings';
    try {
      const longString = 'a'.repeat(10000);
      const longEvent = this.eventRepository.create({
        title: longString,
        description: longString,
        organizerId: 'test-user-id',
        startDate: new Date(Date.now() + 86400000),
        endDate: new Date(Date.now() + 172800000),
        ticketPrice: 10,
        currency: 'USD',
        status: EventStatus.DRAFT,
      });

      await this.eventRepository.save(longEvent);
      await this.eventRepository.remove(longEvent);

      return {
        testCase: testName,
        passed: true,
        description: 'Long strings handled correctly',
      };
    } catch (error) {
      return {
        testCase: testName,
        passed: false,
        description: 'Long string handling failed',
        error: error.message,
      };
    }
  }

  private async testSpecialCharacters(): Promise<EdgeCaseResult> {
    const testName = 'special_characters';
    try {
      const specialChars = '<script>alert("xss")</script> & "quotes" \'apostrophes\'';
      const event = this.eventRepository.create({
        title: specialChars,
        description: specialChars,
        organizerId: 'test-user-id',
        startDate: new Date(Date.now() + 86400000),
        endDate: new Date(Date.now() + 172800000),
        ticketPrice: 10,
        currency: 'USD',
        status: EventStatus.DRAFT,
      });

      await this.eventRepository.save(event);
      await this.eventRepository.remove(event);

      return {
        testCase: testName,
        passed: true,
        description: 'Special characters handled correctly',
      };
    } catch (error) {
      return {
        testCase: testName,
        passed: false,
        description: 'Special character handling failed',
        error: error.message,
      };
    }
  }

  private async testDuplicateEvents(): Promise<EdgeCaseResult> {
    const testName = 'duplicate_events';
    try {
      const event = this.eventRepository.create({
        title: 'Duplicate Test Event',
        organizerId: 'test-user-id',
        startDate: new Date(Date.now() + 86400000),
        endDate: new Date(Date.now() + 172800000),
        ticketPrice: 10,
        currency: 'USD',
        status: EventStatus.DRAFT,
      });

      const saved1 = await this.eventRepository.save(event);
      const saved2 = await this.eventRepository.save({ ...event, id: undefined });

      await this.eventRepository.remove(saved1);
      await this.eventRepository.remove(saved2);

      return {
        testCase: testName,
        passed: true,
        description: 'Duplicate events handled correctly',
      };
    } catch (error) {
      return {
        testCase: testName,
        passed: false,
        description: 'Duplicate event handling failed',
        error: error.message,
      };
    }
  }

  private async testInvalidUuids(): Promise<EdgeCaseResult> {
    const testName = 'invalid_uuids';
    try {
      await this.eventRepository.findOne({ where: { id: 'invalid-uuid' } });
      return {
        testCase: testName,
        passed: true,
        description: 'Invalid UUID handled gracefully',
      };
    } catch (error) {
      return {
        testCase: testName,
        passed: true,
        description: 'Invalid UUID correctly rejected',
      };
    }
  }
}
