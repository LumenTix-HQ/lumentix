import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Role } from '../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { Event } from '../events/entities/event.entity';
import { DecentralizedStorageController } from './decentralized-storage.controller';
import { DecentralizedStorageService } from './decentralized-storage.service';
import { IpfsPinningService } from './ipfs-pinning.service';

const request = (id: string, role = Role.ORGANIZER) =>
  ({
    user: { id, role, email: 'user@example.com' },
  }) as unknown as AuthenticatedRequest;

describe('DecentralizedStorageController', () => {
  let controller: DecentralizedStorageController;
  let storage: {
    upload_media_to_decentralized_storage: jest.Mock;
    pin_event_media: jest.Mock;
    retrieve_media_by_hash: jest.Mock;
  };
  let pinning: {
    pin_to_ipfs: jest.Mock;
    verify_pin_status: jest.Mock;
    migrate_unpinned_assets: jest.Mock;
  };
  let events: { findOne: jest.Mock };

  beforeEach(async () => {
    storage = {
      upload_media_to_decentralized_storage: jest.fn(),
      pin_event_media: jest.fn(),
      retrieve_media_by_hash: jest.fn(),
    };
    pinning = {
      pin_to_ipfs: jest.fn(),
      verify_pin_status: jest.fn(),
      migrate_unpinned_assets: jest.fn(),
    };
    events = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'event-1', organizerId: 'owner-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DecentralizedStorageController],
      providers: [
        { provide: DecentralizedStorageService, useValue: storage },
        { provide: IpfsPinningService, useValue: pinning },
        { provide: getRepositoryToken(Event), useValue: events },
      ],
    }).compile();

    controller = module.get<DecentralizedStorageController>(
      DecentralizedStorageController,
    );
  });

  it('pins an event asset through the pinning service for the organizer', async () => {
    const result = {
      hash: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      eventId: 'event-1',
      pinned: true,
      providers: [],
    };
    pinning.pin_to_ipfs.mockResolvedValue(result);

    await expect(
      controller.pinToIpfs(
        { eventId: 'event-1', hash: result.hash },
        request('owner-1'),
      ),
    ).resolves.toBe(result);
    expect(pinning.pin_to_ipfs).toHaveBeenCalledWith('event-1', result.hash);
  });

  it('rejects pinning by a user who does not own the event', async () => {
    await expect(
      controller.pinToIpfs(
        {
          eventId: 'event-1',
          hash: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        },
        request('other-1'),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(pinning.pin_to_ipfs).not.toHaveBeenCalled();
  });

  it('allows an admin to pin assets for another organizer', async () => {
    pinning.pin_to_ipfs.mockResolvedValue({ providers: [] });

    await expect(
      controller.pinToIpfs(
        {
          eventId: 'event-1',
          hash: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        },
        request('admin-1', Role.ADMIN),
      ),
    ).resolves.toEqual({ providers: [] });
  });

  it('returns pin status from the pinning service', async () => {
    const result = { hash: 'hash-1', pinned: false, providers: [] };
    pinning.verify_pin_status.mockResolvedValue(result);

    await expect(controller.verifyPinStatus('hash-1')).resolves.toBe(result);
    expect(pinning.verify_pin_status).toHaveBeenCalledWith('hash-1');
  });

  it('migrates unpinned assets for the organizer', async () => {
    const result = { eventId: 'event-1', results: [] };
    pinning.migrate_unpinned_assets.mockResolvedValue(result);

    await expect(
      controller.migrateUnpinnedAssets(
        { eventId: 'event-1', hashes: ['hash-1'] },
        request('owner-1'),
      ),
    ).resolves.toBe(result);
    expect(pinning.migrate_unpinned_assets).toHaveBeenCalledWith('event-1', [
      'hash-1',
    ]);
  });

  it('rejects migration for an unknown event', async () => {
    events.findOne.mockResolvedValue(null);

    await expect(
      controller.migrateUnpinnedAssets(
        { eventId: 'event-1', hashes: ['hash-1'] },
        request('owner-1'),
      ),
    ).rejects.toThrow(NotFoundException);
    expect(pinning.migrate_unpinned_assets).not.toHaveBeenCalled();
  });
});
