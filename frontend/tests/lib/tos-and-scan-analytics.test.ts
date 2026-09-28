import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '@/lib/api-client';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Terms of Service and Scan Analytics API Client (Issues #1191 & #1195)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Terms of Service Functions (Issue #1191)', () => {
    const eventId = 'event-abc-123';

    it('save_event_tos and saveEventTos call PATCH /api/proxy/events/:id/terms-of-service', async () => {
      const mockTos = { id: 'tos-1', eventId, termsContent: 'Terms', version: 1, isActive: true };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockTos),
      });

      const body = { termsContent: 'Terms', liabilityDisclaimers: 'Disclaimers' };
      const res = await apiClient.save_event_tos(eventId, body, 'my-token');

      expect(res).toEqual(mockTos);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/proxy/events/${eventId}/terms-of-service`),
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            Authorization: 'Bearer my-token',
          }),
        }),
      );

      // Verify camelCase alias also calls the endpoint
      await apiClient.saveEventTos(eventId, body, 'my-token');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('validate_tos_agreement and validateTosAgreement call POST /api/proxy/events/:id/terms-of-service/validate/:version', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(true),
      });

      const isValid = await apiClient.validate_tos_agreement(eventId, 2);
      expect(isValid).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/proxy/events/${eventId}/terms-of-service/validate/2`),
        expect.objectContaining({ method: 'POST' }),
      );

      const isValidAlias = await apiClient.validateTosAgreement(eventId, 2);
      expect(isValidAlias).toBe(true);
    });

    it('fetch_tos_for_checkout and fetchTosForCheckout call GET /api/proxy/events/:id/terms-of-service', async () => {
      const mockTos = { id: 'tos-active', eventId, termsContent: 'Checkout Terms', version: 1, isActive: true };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockTos),
      });

      const res = await apiClient.fetch_tos_for_checkout(eventId);
      expect(res).toEqual(mockTos);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/proxy/events/${eventId}/terms-of-service`),
        expect.any(Object),
      );

      const resAlias = await apiClient.fetchTosForCheckout(eventId);
      expect(resAlias).toEqual(mockTos);
    });

    it('get_tos_templates returns available templates list', async () => {
      const mockTemplates = [{ id: 'standard-event', name: 'Standard Terms' }];
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockTemplates),
      });

      const templates = await apiClient.get_tos_templates(eventId);
      expect(templates).toEqual(mockTemplates);
    });
  });

  describe('Scan Analytics Functions (Issue #1195)', () => {
    const eventId = 'event-xyz-789';

    it('calculate_scan_velocity and calculateScanVelocity call GET scan-velocity', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ eventId, gateId: 'gate-A', scansPerMinute: 72 }),
      });

      const result = await apiClient.calculate_scan_velocity(eventId, 'gate-A', 'token-1');
      expect(result.scansPerMinute).toBe(72);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/proxy/events/${eventId}/scan-analytics/scan-velocity?gateId=gate-A`),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
        }),
      );

      const aliasResult = await apiClient.calculateScanVelocity(eventId, 'gate-A', 'token-1');
      expect(aliasResult.scansPerMinute).toBe(72);
    });

    it('track_gate_throughput and trackGateThroughput call GET throughput', async () => {
      const mockThroughput = {
        gateId: 'gate-B',
        scanVelocity: 85,
        avgScanTimeMs: 380,
        totalScans: 100,
        failedScans: 2,
        errorRate: 2,
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockThroughput),
      });

      const result = await apiClient.track_gate_throughput(eventId, 'gate-B');
      expect(result).toEqual(mockThroughput);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/proxy/events/${eventId}/scan-analytics/throughput?gateId=gate-B`),
        expect.any(Object),
      );

      const aliasResult = await apiClient.trackGateThroughput(eventId, 'gate-B');
      expect(aliasResult).toEqual(mockThroughput);
    });

    it('fetch_realtime_scan_speed and fetchRealtimeScanSpeed call GET realtime-speed with parameters', async () => {
      const mockSpeedData = [
        { id: 'm-1', eventId, gateId: 'gate-1', scansPerMinute: 60, recordedAt: '2026-09-26T10:00:00Z' },
      ];
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSpeedData),
      });

      const result = await apiClient.fetch_realtime_scan_speed(eventId, 'gate-1', 10);
      expect(result).toEqual(mockSpeedData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/proxy/events/${eventId}/scan-analytics/realtime-speed?gateId=gate-1&minutesBack=10`),
        expect.any(Object),
      );

      const aliasResult = await apiClient.fetchRealtimeScanSpeed(eventId, 'gate-1', 10);
      expect(aliasResult).toEqual(mockSpeedData);
    });

    it('get_staffing_recommendation calls GET staffing-recommendation', async () => {
      const mockRec = {
        eventId,
        gateId: 'gate-1',
        currentVelocity: 95,
        recommendedGates: 3,
        queueStatus: 'congested',
        recommendationText: 'High volume',
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockRec),
      });

      const res = await apiClient.get_staffing_recommendation(eventId, 'gate-1');
      expect(res.recommendedGates).toBe(3);
    });
  });
});
