import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdaptiveBitrateService } from './adaptive-bitrate.service';
import { StreamingConfig } from './entities/streaming-config.entity';
import { ViewerStreamSession } from './entities/viewer-stream-session.entity';

const EVENT_ID = 'event-1';
const VIEWER_ID = 'viewer-1';

/** Ladder an organizer would have built with a 4500 kbps target. */
const LADDER = [
  { profile: '1080p', bitrateKbps: 4500 },
  { profile: '720p', bitrateKbps: 2475 },
  { profile: '480p', bitrateKbps: 1350 },
];

function makeConfig(overrides: Partial<StreamingConfig> = {}): StreamingConfig {
  return {
    id: 'cfg-1',
    eventId: EVENT_ID,
    cdnBaseUrl: 'https://cdn.test',
    streamUrl: 'https://stream.test/live.m3u8',
    qualityProfile: 'auto',
    targetBitrateKbps: 4500,
    adaptiveBitrate: true,
    deliveryConfig: { ladder: LADDER },
    performanceMetrics: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as StreamingConfig;
}

/**
 * In-memory stand-in for the session repository. `save` mutates and returns the
 * same object the service is holding, matching TypeORM closely enough that the
 * tier-selection logic is what is under test rather than the persistence layer.
 */
function makeSessionRepo() {
  let stored: ViewerStreamSession | null = null;

  return {
    findOne: jest.fn(async () => stored),
    create: jest.fn((data: Partial<ViewerStreamSession>) => ({ ...data })),
    save: jest.fn(async (session: ViewerStreamSession) => {
      stored = session;
      return session;
    }),
    /** Seed an existing session, as a returning viewer would have. */
    seed(session: Partial<ViewerStreamSession>) {
      stored = {
        eventId: EVENT_ID,
        viewerId: VIEWER_ID,
        measuredBandwidthKbps: 0,
        smoothedBandwidthKbps: 0,
        currentTier: 'auto',
        currentBitrateKbps: 0,
        manualTierOverride: null,
        bufferingEventCount: 0,
        totalBufferingMs: 0,
        lastBufferingAt: null,
        switchHistory: [],
        ...session,
      } as ViewerStreamSession;
    },
  };
}

describe('AdaptiveBitrateService', () => {
  let service: AdaptiveBitrateService;
  let sessionRepo: ReturnType<typeof makeSessionRepo>;
  let streamingRepo: { findOne: jest.Mock; save: jest.Mock };
  let config: StreamingConfig;

  beforeEach(async () => {
    config = makeConfig();
    sessionRepo = makeSessionRepo();
    streamingRepo = {
      findOne: jest.fn(async () => config),
      save: jest.fn(async (c: StreamingConfig) => c),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdaptiveBitrateService,
        { provide: getRepositoryToken(ViewerStreamSession), useValue: sessionRepo },
        { provide: getRepositoryToken(StreamingConfig), useValue: streamingRepo },
        { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
      ],
    }).compile();

    service = module.get(AdaptiveBitrateService);
  });

  describe('detectViewerBandwidth', () => {
    it('selects the highest tier the bandwidth sustains with headroom', async () => {
      // 6000 clears 4500 * 1.25 = 5625.
      const state = await service.detectViewerBandwidth(EVENT_ID, VIEWER_ID, {
        measuredBandwidthKbps: 6000,
      });

      expect(state.currentTier).toBe('1080p');
      expect(state.currentBitrateKbps).toBe(4500);
      expect(state.adaptiveEnabled).toBe(true);
    });

    it('refuses a tier it can only just afford, leaving headroom', async () => {
      // 4600 exceeds 4500 but not 4500 * 1.25.
      const state = await service.detectViewerBandwidth(EVENT_ID, VIEWER_ID, {
        measuredBandwidthKbps: 4600,
      });

      expect(state.currentTier).toBe('720p');
    });

    it('falls back to the lowest tier below the bottom of the ladder', async () => {
      const state = await service.detectViewerBandwidth(EVENT_ID, VIEWER_ID, {
        measuredBandwidthKbps: 200,
      });

      expect(state.currentTier).toBe('480p');
    });

    it('smooths successive samples instead of tracking the latest', async () => {
      await service.detectViewerBandwidth(EVENT_ID, VIEWER_ID, {
        measuredBandwidthKbps: 6000,
      });
      const state = await service.detectViewerBandwidth(EVENT_ID, VIEWER_ID, {
        measuredBandwidthKbps: 1000,
      });

      // 6000 * 0.6 + 1000 * 0.4 = 4000, well above the raw 1000.
      expect(state.measuredBandwidthKbps).toBe(1000);
      expect(state.smoothedBandwidthKbps).toBe(4000);
    });

    it('does not drop a tier on one slow sample', async () => {
      await service.detectViewerBandwidth(EVENT_ID, VIEWER_ID, {
        measuredBandwidthKbps: 6000,
      });
      const state = await service.detectViewerBandwidth(EVENT_ID, VIEWER_ID, {
        measuredBandwidthKbps: 3000,
      });

      // Smoothed to 4800, which still clears 720p but not 1080p.
      expect(state.currentTier).toBe('720p');
    });

    it('records the switch in the session history', async () => {
      await service.detectViewerBandwidth(EVENT_ID, VIEWER_ID, {
        measuredBandwidthKbps: 6000,
      });

      const saved = sessionRepo.save.mock.calls.at(-1)![0];
      expect(saved.switchHistory).toHaveLength(1);
      expect(saved.switchHistory[0]).toMatchObject({
        fromTier: 'auto',
        toTier: '1080p',
        reason: 'bandwidth',
      });
    });

    it('rejects an event with no streaming configuration', async () => {
      streamingRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.detectViewerBandwidth(EVENT_ID, VIEWER_ID, {
          measuredBandwidthKbps: 3000,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('derives a ladder when the organizer has not built one', async () => {
      config = makeConfig({ deliveryConfig: {}, targetBitrateKbps: 3000 });
      streamingRepo.findOne.mockResolvedValue(config);

      const state = await service.detectViewerBandwidth(EVENT_ID, VIEWER_ID, {
        measuredBandwidthKbps: 9000,
      });

      expect(state.availableTiers.map((t) => t.profile)).toEqual([
        '1080p',
        '720p',
        '480p',
      ]);
      expect(state.currentTier).toBe('1080p');
    });
  });

  describe('switchBitrateTier', () => {
    it('pins the requested tier and disables adaptive switching', async () => {
      const state = await service.switchBitrateTier(EVENT_ID, VIEWER_ID, {
        tier: '480p',
      });

      expect(state.currentTier).toBe('480p');
      expect(state.manualTierOverride).toBe('480p');
      expect(state.adaptiveEnabled).toBe(false);
      expect(state.lastSwitchReason).toBe('manual');
    });

    it('honours a pinned tier the bandwidth cannot sustain', async () => {
      await service.switchBitrateTier(EVENT_ID, VIEWER_ID, { tier: '1080p' });

      const state = await service.detectViewerBandwidth(EVENT_ID, VIEWER_ID, {
        measuredBandwidthKbps: 300,
      });

      expect(state.currentTier).toBe('1080p');
      expect(state.adaptiveEnabled).toBe(false);
    });

    it('clears the override and re-selects when passed null', async () => {
      sessionRepo.seed({
        manualTierOverride: '1080p',
        currentTier: '1080p',
        currentBitrateKbps: 4500,
        smoothedBandwidthKbps: 1500,
      });

      const state = await service.switchBitrateTier(EVENT_ID, VIEWER_ID, {
        tier: null,
      });

      expect(state.manualTierOverride).toBeNull();
      expect(state.adaptiveEnabled).toBe(true);
      expect(state.currentTier).toBe('480p');
    });

    it('treats "auto" as clearing the override', async () => {
      sessionRepo.seed({ manualTierOverride: '480p', currentTier: '480p' });

      const state = await service.switchBitrateTier(EVENT_ID, VIEWER_ID, {
        tier: 'auto',
      });

      expect(state.manualTierOverride).toBeNull();
    });

    it('rejects a tier that is not on the ladder', async () => {
      await expect(
        service.switchBitrateTier(EVENT_ID, VIEWER_ID, { tier: '4k' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('reportBufferingEvent', () => {
    it('cuts the bandwidth estimate on a stall', async () => {
      sessionRepo.seed({
        smoothedBandwidthKbps: 6000,
        currentTier: '1080p',
        currentBitrateKbps: 4500,
      });

      const state = await service.reportBufferingEvent(EVENT_ID, VIEWER_ID, {
        stalledMs: 1200,
      });

      expect(state.smoothedBandwidthKbps).toBe(4500);
      expect(state.bufferingEventCount).toBe(1);
      expect(state.totalBufferingMs).toBe(1200);
    });

    it('steps down a tier once stalls cross the threshold', async () => {
      sessionRepo.seed({
        smoothedBandwidthKbps: 6000,
        currentTier: '1080p',
        currentBitrateKbps: 4500,
      });

      await service.reportBufferingEvent(EVENT_ID, VIEWER_ID, { stalledMs: 900 });
      const state = await service.reportBufferingEvent(EVENT_ID, VIEWER_ID, {
        stalledMs: 900,
      });

      expect(state.bufferingEventCount).toBe(2);
      expect(state.currentTier).toBe('720p');
      expect(state.lastSwitchReason).toBe('buffering');
    });

    it('restarts the stall count after a quiet period', async () => {
      const longAgo = new Date(Date.now() - 5 * 60 * 1000);
      sessionRepo.seed({
        smoothedBandwidthKbps: 6000,
        currentTier: '1080p',
        bufferingEventCount: 3,
        lastBufferingAt: longAgo,
      });

      const state = await service.reportBufferingEvent(EVENT_ID, VIEWER_ID, {
        stalledMs: 500,
      });

      expect(state.bufferingEventCount).toBe(1);
      expect(state.currentTier).toBe('1080p');
    });

    it('never steps below the lowest tier', async () => {
      sessionRepo.seed({
        smoothedBandwidthKbps: 100,
        currentTier: '480p',
        currentBitrateKbps: 1350,
        bufferingEventCount: 5,
        lastBufferingAt: new Date(),
      });

      const state = await service.reportBufferingEvent(EVENT_ID, VIEWER_ID, {
        stalledMs: 2000,
      });

      expect(state.currentTier).toBe('480p');
    });

    it('does not move a viewer who pinned a tier, but still records the stall', async () => {
      sessionRepo.seed({
        manualTierOverride: '1080p',
        currentTier: '1080p',
        currentBitrateKbps: 4500,
        smoothedBandwidthKbps: 6000,
        bufferingEventCount: 1,
        lastBufferingAt: new Date(),
      });

      const state = await service.reportBufferingEvent(EVENT_ID, VIEWER_ID, {
        stalledMs: 3000,
      });

      expect(state.currentTier).toBe('1080p');
      expect(state.bufferingEventCount).toBe(2);
      expect(state.totalBufferingMs).toBe(3000);
      expect(state.lastSwitchReason).toBe('manual');
    });

    it('rolls the stall into the organizer performance metrics', async () => {
      await service.reportBufferingEvent(EVENT_ID, VIEWER_ID, { stalledMs: 800 });

      expect(streamingRepo.save).toHaveBeenCalled();
      expect(config.performanceMetrics).toMatchObject({
        bufferingEvents: 1,
        totalBufferingMs: 800,
      });
    });

    it('accumulates metrics across repeated stalls', async () => {
      await service.reportBufferingEvent(EVENT_ID, VIEWER_ID, { stalledMs: 800 });
      await service.reportBufferingEvent(EVENT_ID, VIEWER_ID, { stalledMs: 400 });

      expect(config.performanceMetrics).toMatchObject({
        bufferingEvents: 2,
        totalBufferingMs: 1200,
      });
    });
  });

  describe('getViewerStreamState', () => {
    it('reports state without recording a measurement', async () => {
      sessionRepo.seed({
        currentTier: '720p',
        currentBitrateKbps: 2475,
        smoothedBandwidthKbps: 3200,
      });

      const state = await service.getViewerStreamState(EVENT_ID, VIEWER_ID);

      expect(state.currentTier).toBe('720p');
      expect(state.playbackUrl).toBe(
        `https://cdn.test/events/${EVENT_ID}/720p.m3u8`,
      );
      expect(sessionRepo.save).not.toHaveBeenCalled();
    });
  });
});
