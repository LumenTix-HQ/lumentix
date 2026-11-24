import { BadRequestException } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';

describe('CampaignsService A/B testing', () => {
  let service: CampaignsService;
  let campaignRepository: { findOne: jest.Mock; save: jest.Mock };
  let variantRepository: { find: jest.Mock; save: jest.Mock };
  let recipientRepository: { create: jest.Mock; save: jest.Mock };
  let usersService: { findById: jest.Mock };
  let mailerService: { queueEmail: jest.Mock };

  beforeEach(() => {
    campaignRepository = {
      findOne: jest.fn(),
      save: jest
        .fn()
        .mockImplementation((campaign) => Promise.resolve(campaign)),
    };
    variantRepository = {
      find: jest.fn(),
      save: jest.fn(),
    };
    recipientRepository = {
      create: jest.fn((recipient) => recipient),
      save: jest.fn().mockResolvedValue(undefined),
    };
    usersService = { findById: jest.fn() };
    mailerService = { queueEmail: jest.fn().mockResolvedValue(undefined) };

    service = new CampaignsService(
      campaignRepository as any,
      variantRepository as any,
      recipientRepository as any,
      usersService as any,
      mailerService as any,
    );
  });

  it('rejects weights for variants outside the campaign', async () => {
    campaignRepository.findOne.mockResolvedValue({
      id: 'campaign-1',
      organizerId: 'organizer-1',
      status: 'draft',
    });
    variantRepository.find.mockResolvedValue([
      { id: 'variant-a', label: 'A' },
      { id: 'variant-b', label: 'B' },
    ]);

    await expect(
      service.splitAudience(
        'campaign-1',
        {
          recipientUserIds: ['user-1'],
          variantWeights: { 'unknown-variant': 100 },
        },
        'organizer-1',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(usersService.findById).not.toHaveBeenCalled();
    expect(recipientRepository.save).not.toHaveBeenCalled();
  });

  it('selects the variant with the strongest weighted open and click rates', async () => {
    const campaign = {
      id: 'campaign-1',
      organizerId: 'organizer-1',
      status: 'testing',
    };
    const variants = [
      {
        id: 'variant-a',
        label: 'A',
        sentCount: 100,
        openCount: 90,
        clickCount: 10,
      },
      {
        id: 'variant-b',
        label: 'B',
        sentCount: 100,
        openCount: 40,
        clickCount: 50,
      },
    ];
    campaignRepository.findOne.mockResolvedValue(campaign);
    variantRepository.find.mockResolvedValue(variants);

    const result = await service.selectWinningVariant(
      'campaign-1',
      'organizer-1',
    );

    expect(result.winner.id).toBe('variant-b');
    expect(campaign.winningVariantId).toBe('variant-b');
    expect(campaign.status).toBe('completed');
  });
});
