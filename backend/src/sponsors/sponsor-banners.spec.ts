import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MoreThan } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SponsorsService } from './sponsors.service';
import { UpdateSponsorBannerDto } from './dto/sponsor-banner.dto';

const sponsor = (overrides: Record<string, unknown> = {}) => ({
  id: 'sp-1',
  eventId: 'e1',
  userId: 'u-secret',
  amount: 500,
  displayName: 'Stellar Co',
  logoUrl: 'https://cdn.example.com/logo.png',
  websiteUrl: 'https://example.com',
  weight: 1,
  isActive: true,
  impressionCount: 0,
  clickCount: 0,
  ...overrides,
});

describe('SponsorsService — banner rotation and impression tracking', () => {
  let sponsorRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    increment: jest.Mock;
  };
  let eventsService: { getEventById: jest.Mock };
  let service: SponsorsService;

  beforeEach(() => {
    sponsorRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((s: unknown) => Promise.resolve(s)),
      increment: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    eventsService = {
      getEventById: jest
        .fn()
        .mockResolvedValue({ id: 'e1', organizerId: 'org-1' }),
    };
    service = new SponsorsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      sponsorRepo as any,
      eventsService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  describe('rotateSponsorBanners', () => {
    it('only queries active sponsors with a positive weight', async () => {
      await service.rotateSponsorBanners('e1');
      expect(sponsorRepo.find).toHaveBeenCalledWith({
        where: { eventId: 'e1', isActive: true, weight: MoreThan(0) },
      });
    });

    it('returns only public banner fields', async () => {
      sponsorRepo.find.mockResolvedValue([sponsor()]);

      const [banner] = await service.rotateSponsorBanners('e1');

      expect(banner).toEqual({
        id: 'sp-1',
        displayName: 'Stellar Co',
        logoUrl: 'https://cdn.example.com/logo.png',
        websiteUrl: 'https://example.com',
      });
    });

    it('drops non-http(s) URLs so they cannot be rendered as links', async () => {
      sponsorRepo.find.mockResolvedValue([
        sponsor({
          websiteUrl: 'javascript:alert(1)',
          logoUrl: 'data:image/svg+xml,<svg/>',
        }),
      ]);

      const [banner] = await service.rotateSponsorBanners('e1');

      expect(banner.websiteUrl).toBeNull();
      expect(banner.logoUrl).toBeNull();
    });

    it('orders by weighted-random key', async () => {
      sponsorRepo.find.mockResolvedValue([
        sponsor({ id: 'light', weight: 1 }),
        sponsor({ id: 'heavy', weight: 9 }),
      ]);
      // Same random draw for both: the heavier weight yields the larger key.
      const banners = await service.rotateSponsorBanners('e1', () => 0.5);
      expect(banners.map((b) => b.id)).toEqual(['heavy', 'light']);
    });

    it('shows heavier sponsors first proportionally more often', async () => {
      sponsorRepo.find.mockResolvedValue([
        sponsor({ id: 'light', weight: 1 }),
        sponsor({ id: 'heavy', weight: 3 }),
      ]);

      // Deterministic PRNG so the test is stable.
      let seed = 42;
      const random = () => {
        seed = (seed * 1664525 + 1013904223) % 2 ** 32;
        return seed / 2 ** 32;
      };

      const runs = 4000;
      let heavyFirst = 0;
      for (let i = 0; i < runs; i++) {
        const [first] = await service.rotateSponsorBanners('e1', random);
        if (first.id === 'heavy') heavyFirst++;
      }

      // P(heavy first) = 3 / (1 + 3) = 0.75
      expect(heavyFirst / runs).toBeGreaterThan(0.72);
      expect(heavyFirst / runs).toBeLessThan(0.78);
    });
  });

  describe('recordSponsorImpression / recordSponsorClick', () => {
    it('increments the impression counter for banners in rotation only', async () => {
      await service.recordSponsorImpression('sp-1');
      expect(sponsorRepo.increment).toHaveBeenCalledWith(
        { id: 'sp-1', isActive: true, weight: MoreThan(0) },
        'impressionCount',
        1,
      );
    });

    it('increments the click counter', async () => {
      await service.recordSponsorClick('sp-1');
      expect(sponsorRepo.increment).toHaveBeenCalledWith(
        { id: 'sp-1', isActive: true, weight: MoreThan(0) },
        'clickCount',
        1,
      );
    });

    it('404s for unknown or paused sponsors', async () => {
      sponsorRepo.increment.mockResolvedValue({ affected: 0 });
      await expect(service.recordSponsorImpression('sp-x')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.recordSponsorClick('sp-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateSponsorBanner', () => {
    it('lets the organizer change weight and active state', async () => {
      sponsorRepo.findOne.mockResolvedValue(sponsor());

      const result = await service.updateSponsorBanner(
        'e1',
        'sp-1',
        { weight: 5, isActive: false },
        'org-1',
      );

      expect(sponsorRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'sp-1', eventId: 'e1' },
      });
      expect(result).toEqual(
        expect.objectContaining({ id: 'sp-1', weight: 5, isActive: false }),
      );
      expect(result).not.toHaveProperty('userId');
    });

    it('rejects non-organizers', async () => {
      await expect(
        service.updateSponsorBanner('e1', 'sp-1', { weight: 5 }, 'intruder'),
      ).rejects.toThrow(ForbiddenException);
      expect(sponsorRepo.save).not.toHaveBeenCalled();
    });

    it('404s when the sponsor belongs to another event', async () => {
      sponsorRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateSponsorBanner('e1', 'sp-other', { weight: 5 }, 'org-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('generateSponsorReport', () => {
    it('reports per-sponsor CTR, share of impressions and expected share, sorted by impressions', async () => {
      sponsorRepo.find.mockResolvedValue([
        sponsor({ id: 'a', weight: 1, impressionCount: 100, clickCount: 5 }),
        sponsor({ id: 'b', weight: 3, impressionCount: 300, clickCount: 30 }),
        sponsor({
          id: 'c',
          weight: 2,
          isActive: false,
          impressionCount: 0,
          clickCount: 0,
        }),
      ]);

      const report = await service.generateSponsorReport('e1', 'org-1');

      expect(report.totalImpressions).toBe(400);
      expect(report.totalClicks).toBe(35);
      expect(report.clickThroughRate).toBe(0.0875);
      expect(report.sponsors.map((s) => s.sponsorId)).toEqual(['b', 'a', 'c']);
      expect(report.sponsors[0]).toEqual(
        expect.objectContaining({
          clickThroughRate: 0.1,
          impressionShare: 0.75,
          expectedShare: 0.75,
        }),
      );
      expect(report.sponsors[1]).toEqual(
        expect.objectContaining({
          clickThroughRate: 0.05,
          impressionShare: 0.25,
          expectedShare: 0.25,
        }),
      );
      expect(report.sponsors[2]).toEqual(
        expect.objectContaining({
          clickThroughRate: 0,
          impressionShare: 0,
          expectedShare: 0,
        }),
      );
    });

    it('rejects non-organizers', async () => {
      await expect(
        service.generateSponsorReport('e1', 'intruder'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

describe('UpdateSponsorBannerDto', () => {
  const errorsFor = (body: unknown) =>
    validate(plainToInstance(UpdateSponsorBannerDto, body));

  it('accepts weights between 0 and 100', async () => {
    expect(await errorsFor({ weight: 0 })).toHaveLength(0);
    expect(await errorsFor({ weight: 100, isActive: true })).toHaveLength(0);
  });

  it.each([
    [{ weight: -1 }],
    [{ weight: 101 }],
    [{ weight: 1.5 }],
    [{ isActive: 'yes' }],
  ])('rejects %j', async (body) => {
    expect(await errorsFor(body)).not.toHaveLength(0);
  });
});
