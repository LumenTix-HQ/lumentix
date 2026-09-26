import { TermsOfServiceController } from './terms-of-service.controller';

describe('TermsOfServiceController', () => {
  let controller: TermsOfServiceController;
  let mockTosService: any;

  const eventId = 'event-123';
  const organizerId = 'org-456';
  const req = { user: { id: organizerId } } as any;

  beforeEach(() => {
    mockTosService = {
      getTosTemplates: jest.fn().mockReturnValue([
        { id: 'standard-event', name: 'Standard Event Terms' },
      ]),
      applyTemplate: jest.fn().mockResolvedValue({ id: 'tos-1', version: 1, isActive: true }),
      saveEventTos: jest.fn().mockResolvedValue({ id: 'tos-2', version: 1, isActive: true }),
      fetchTosForCheckout: jest.fn().mockResolvedValue({ id: 'tos-1', version: 1, isActive: true }),
      validateTosAgreement: jest.fn().mockResolvedValue(true),
      getEventTosHistory: jest.fn().mockResolvedValue([{ id: 'tos-1', version: 1 }]),
    };

    controller = new TermsOfServiceController(mockTosService);
  });

  it('returns customizable templates list', () => {
    const templates = controller.getTemplates();
    expect(templates).toHaveLength(1);
    expect(mockTosService.getTosTemplates).toHaveBeenCalled();
  });

  it('applies template to an event', async () => {
    const overrides = { termsContent: 'Modified terms' };
    const res = await controller.applyTemplate(eventId, 'standard-event', overrides, req);
    expect(res).toBeDefined();
    expect(mockTosService.applyTemplate).toHaveBeenCalledWith(
      eventId,
      'standard-event',
      organizerId,
      overrides,
    );
  });

  it('saves custom terms of service', async () => {
    const dto = { termsContent: 'New terms', liabilityDisclaimers: 'Disclaimers' };
    const res = await controller.saveEventTos(eventId, dto, req);
    expect(res).toBeDefined();
    expect(mockTosService.saveEventTos).toHaveBeenCalledWith(eventId, dto, organizerId);
  });

  it('fetches ToS for checkout', async () => {
    const res = await controller.fetchTosForCheckout(eventId);
    expect(res).toBeDefined();
    expect(mockTosService.fetchTosForCheckout).toHaveBeenCalledWith(eventId);
  });

  it('validates ToS agreement version', async () => {
    const res = await controller.validateTosAgreement(eventId, 1);
    expect(res).toBe(true);
    expect(mockTosService.validateTosAgreement).toHaveBeenCalledWith(eventId, 1);
  });

  it('fetches version history for organizer', async () => {
    const res = await controller.getHistory(eventId);
    expect(res).toHaveLength(1);
    expect(mockTosService.getEventTosHistory).toHaveBeenCalledWith(eventId);
  });
});
