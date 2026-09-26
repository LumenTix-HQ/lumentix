import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TermsOfServiceService } from './terms-of-service.service';

describe('TermsOfServiceService', () => {
  let service: TermsOfServiceService;
  let mockTosRepo: any;
  let mockEventsService: any;

  const eventId = 'event-111';
  const organizerId = 'organizer-222';

  beforeEach(() => {
    mockTosRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation((val) => ({ id: 'tos-uuid', ...val })),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    };
    mockEventsService = {
      getEventById: jest.fn().mockResolvedValue({ id: eventId, organizerId }),
    };

    service = new TermsOfServiceService(mockTosRepo, mockEventsService);
  });

  describe('save_event_tos / saveEventTos', () => {
    it('creates initial version 1 terms of service when none exists', async () => {
      mockTosRepo.findOne.mockResolvedValue(null);

      const dto = {
        termsContent: 'Custom event terms',
        liabilityDisclaimers: 'No liability for damage',
        customAgreements: 'Attendee agrees to rules',
      };

      const result = await service.save_event_tos(eventId, dto, organizerId);

      expect(result.version).toBe(1);
      expect(result.isActive).toBe(true);
      expect(result.termsContent).toBe(dto.termsContent);
      expect(mockTosRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId,
          version: 1,
          isActive: true,
        }),
      );
      expect(mockTosRepo.save).toHaveBeenCalled();
    });

    it('archives previous version and creates incremented version when updating', async () => {
      const existingTos = {
        id: 'tos-v1',
        eventId,
        version: 1,
        isActive: true,
      };
      mockTosRepo.findOne.mockResolvedValue(existingTos);

      const dto = {
        termsContent: 'Updated terms v2',
        liabilityDisclaimers: 'Updated disclaimers',
      };

      const result = await service.saveEventTos(eventId, dto, organizerId);

      expect(existingTos.isActive).toBe(false);
      expect(result.version).toBe(2);
      expect(result.isActive).toBe(true);
    });

    it('rejects saving terms if caller is not the event organizer', async () => {
      await expect(
        service.save_event_tos(eventId, { termsContent: 'Illegal update' }, 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('validate_tos_agreement / validateTosAgreement', () => {
    it('returns true when agreed version is active', async () => {
      mockTosRepo.findOne.mockResolvedValue({ eventId, version: 1, isActive: true });

      const isValid = await service.validate_tos_agreement(eventId, 1);
      expect(isValid).toBe(true);
    });

    it('returns false when agreed version is inactive (archived)', async () => {
      mockTosRepo.findOne.mockResolvedValue({ eventId, version: 1, isActive: false });

      const isValid = await service.validateTosAgreement(eventId, 1);
      expect(isValid).toBe(false);
    });

    it('throws NotFoundException when agreed version does not exist', async () => {
      mockTosRepo.findOne.mockResolvedValue(null);

      await expect(service.validate_tos_agreement(eventId, 99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('fetch_tos_for_checkout / fetchTosForCheckout', () => {
    it('returns active terms of service for checkout display', async () => {
      const activeTos = {
        id: 'tos-active',
        eventId,
        version: 2,
        isActive: true,
        termsContent: 'Checkout terms',
      };
      mockTosRepo.findOne.mockResolvedValue(activeTos);

      const result = await service.fetch_tos_for_checkout(eventId);
      expect(result).toEqual(activeTos);
      expect(mockTosRepo.findOne).toHaveBeenCalledWith({
        where: { eventId, isActive: true },
      });
    });

    it('throws NotFoundException if no active terms exist for event', async () => {
      mockTosRepo.findOne.mockResolvedValue(null);

      await expect(service.fetchTosForCheckout(eventId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('Templates support', () => {
    it('provides customizable templates for organizers', () => {
      const templates = service.get_tos_templates();
      expect(templates.length).toBeGreaterThanOrEqual(4);
      expect(templates.map((t) => t.category)).toContain('general');
      expect(templates.map((t) => t.category)).toContain('liability');
      expect(templates.map((t) => t.category)).toContain('media');
      expect(templates.map((t) => t.category)).toContain('refund');
    });

    it('applies a template to an event with optional overrides', async () => {
      mockTosRepo.findOne.mockResolvedValue(null);

      const result = await service.applyTemplate(eventId, 'sports-activity', organizerId, {
        customAgreements: 'Specific organizer addition',
      });

      expect(result.version).toBe(1);
      expect(result.liabilityDisclaimers).toContain('injury or property damage');
      expect(result.customAgreements).toBe('Specific organizer addition');
    });
  });
});
