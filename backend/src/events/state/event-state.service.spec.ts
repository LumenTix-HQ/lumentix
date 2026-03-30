import { BadRequestException } from '@nestjs/common';
import { EventStateService } from './event-state.service';
import { EventStatus } from '../entities/event.entity';

describe('EventStateService', () => {
  let service: EventStateService;

  beforeEach(() => {
    service = new EventStateService();
  });

  describe('valid transitions', () => {
    it('allows draft → published', () => {
      expect(() =>
        service.validateTransition(EventStatus.DRAFT, EventStatus.PUBLISHED),
      ).not.toThrow();
    });

    it('allows published → completed', () => {
      expect(() =>
        service.validateTransition(
          EventStatus.PUBLISHED,
          EventStatus.COMPLETED,
        ),
      ).not.toThrow();
    });

    it('allows published → cancelled', () => {
      expect(() =>
        service.validateTransition(
          EventStatus.PUBLISHED,
          EventStatus.CANCELLED,
        ),
      ).not.toThrow();
    });
  });

  describe('invalid transitions', () => {
    it('rejects draft → completed', () => {
      expect(() =>
        service.validateTransition(EventStatus.DRAFT, EventStatus.COMPLETED),
      ).toThrow(BadRequestException);
    });

    it('rejects draft → cancelled', () => {
      expect(() =>
        service.validateTransition(EventStatus.DRAFT, EventStatus.CANCELLED),
      ).toThrow(BadRequestException);
    });

    it('rejects completed → any status', () => {
      for (const next of Object.values(EventStatus)) {
        expect(() =>
          service.validateTransition(
            EventStatus.COMPLETED,
            next as EventStatus,
          ),
        ).toThrow(BadRequestException);
      }
    });

    it('rejects cancelled → any status', () => {
      for (const next of Object.values(EventStatus)) {
        expect(() =>
          service.validateTransition(
            EventStatus.CANCELLED,
            next as EventStatus,
          ),
        ).toThrow(BadRequestException);
      }
    });

    it('rejects published → draft', () => {
      expect(() =>
        service.validateTransition(EventStatus.PUBLISHED, EventStatus.DRAFT),
      ).toThrow(BadRequestException);
    });

    it('includes helpful error message', () => {
      try {
        service.validateTransition(EventStatus.DRAFT, EventStatus.COMPLETED);
      } catch (e) {
        expect(e.message).toContain('draft');
        expect(e.message).toContain('completed');
      }
    });

    it('mentions terminal state when no transitions are allowed', () => {
      try {
        service.validateTransition(EventStatus.COMPLETED, EventStatus.DRAFT);
      } catch (e) {
        expect(e.message).toContain('terminal');
      }
    });
  });
});
