import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PinToIpfsDto,
  PinToIpfsResponseDto,
  PinStatusResponseDto,
  MigrateUnpinnedAssetsDto,
  MigrateUnpinnedAssetsResponseDto,
} from './dto/storage.dto';

/**
 * Real IPFS pinning integration via configurable provider.
 *
 * Supports Pinata, web3.storage, or any IPFS-compatible pinning API.
 * Set IPFS_API_URL and IPFS_API_KEY in your environment to connect.
 */
@Injectable()
export class DecentralizedStorageService {
  private readonly logger = new Logger(DecentralizedStorageService.name);
  private readonly pinMetadata = new Map<
    string,
    { eventId: string; url: string; pinnedAt: Date }
  >();

  constructor(private readonly configService: ConfigService) {}

  async upload_media_to_decentralized_storage(
    eventId: string,
    fileName: string,
    mimeType: string,
    content: string,
  ): Promise<{
    hash: string;
    url: string;
    eventId: string;
    fileName: string;
    mimeType: string;
    uploaded: boolean;
  }> {
    const apiKey = this.configService.get<string>('IPFS_API_KEY');
    const apiUrl = this.configService.get<string>('IPFS_API_URL');

    if (!apiKey || !apiUrl) {
      throw new BadRequestException(
        'IPFS pinning is not configured. Set IPFS_API_URL and IPFS_API_KEY environment variables.',
      );
    }

    const contentBuffer = Buffer.from(content, 'utf-8');
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([contentBuffer], { type: mimeType }),
      fileName,
    );
    formData.append(
      'pinataMetadata',
      JSON.stringify({ name: fileName, keyvalues: { eventId } }),
    );

    const response = await fetch(`${apiUrl}/pinning/pinFileToIPFS`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      this.logger.error(`IPFS pin failed: ${response.status} ${errorText}`);
      throw new BadRequestException(
        `Failed to pin content to IPFS: ${response.statusText}`,
      );
    }

    const result = (await response.json()) as { IpfsHash: string };
    const hash = result.IpfsHash;
    const gateway = this.configService.get<string>(
      'IPFS_GATEWAY',
      'https://ipfs.io/ipfs',
    );
    const url = `${gateway}/${hash}`;

    this.pinMetadata.set(hash, { eventId, url, pinnedAt: new Date() });

    return { hash, url, eventId, fileName, mimeType, uploaded: true };
  }

  pin_event_media(
    eventId: string,
    hash: string,
  ): Promise<{ hash: string; eventId: string; pinned: boolean; url: string }> {
    const gateway = this.configService.get<string>(
      'IPFS_GATEWAY',
      'https://ipfs.io/ipfs',
    );
    const url = `${gateway}/${hash}`;
    this.pinMetadata.set(hash, { eventId, url, pinnedAt: new Date() });
    return Promise.resolve({ hash, eventId, pinned: true, url });
  }

  retrieve_media_by_hash(
    hash: string,
  ): Promise<{ eventId: string; url: string; pinnedAt: Date; hash: string }> {
    const pinned = this.pinMetadata.get(hash);
    if (!pinned)
      throw new NotFoundException(`Media with hash "${hash}" not found`);
    return Promise.resolve({ ...pinned, hash });
  }

  async pin_to_ipfs(dto: PinToIpfsDto): Promise<PinToIpfsResponseDto> {
    const apiKey = this.configService.get<string>('IPFS_API_KEY');
    const apiUrl = this.configService.get<string>('IPFS_API_URL');

    if (!apiKey || !apiUrl) {
      throw new BadRequestException(
        'IPFS pinning is not configured. Set IPFS_API_URL and IPFS_API_KEY environment variables.',
      );
    }

    const contentBuffer = Buffer.from(dto.content, 'utf-8');
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([contentBuffer], { type: dto.mimeType }),
      dto.fileName,
    );
    formData.append(
      'pinataMetadata',
      JSON.stringify({
        name: dto.fileName,
        keyvalues: { eventId: dto.eventId },
      }),
    );

    const response = await fetch(`${apiUrl}/pinning/pinFileToIPFS`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      this.logger.error(
        `IPFS pin_to_ipfs failed: ${response.status} ${errorText}`,
      );
      throw new BadRequestException(
        `Failed to pin content to IPFS: ${response.statusText}`,
      );
    }

    const result = (await response.json()) as { IpfsHash: string };
    const hash = result.IpfsHash;
    const gateway = this.configService.get<string>(
      'IPFS_GATEWAY',
      'https://ipfs.io/ipfs',
    );
    const url = `${gateway}/${hash}`;

    // Store pin metadata
    this.pinMetadata.set(hash, {
      eventId: dto.eventId,
      url,
      pinnedAt: new Date(),
    });

    // For redundant pinning, attempt a second provider if configured
    let redundantPins = 1;
    const backupApiUrl = this.configService.get<string>('IPFS_BACKUP_API_URL');
    const backupApiKey = this.configService.get<string>('IPFS_BACKUP_API_KEY');
    if (dto.redundant !== false && backupApiUrl && backupApiKey) {
      try {
        const backupFormData = new FormData();
        backupFormData.append(
          'file',
          new Blob([contentBuffer], { type: dto.mimeType }),
          dto.fileName,
        );
        const backupResp = await fetch(
          `${backupApiUrl}/pinning/pinFileToIPFS`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${backupApiKey}` },
            body: backupFormData,
          },
        );
        if (backupResp.ok) {
          redundantPins = 2;
          this.logger.log(`Redundant pin successful for hash ${hash}`);
        }
      } catch (err) {
        this.logger.warn(`Backup IPFS pin failed for hash ${hash}: ${err}`);
      }
    }

    return {
      hash,
      url,
      eventId: dto.eventId,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      pinned: true,
      redundantPins,
    };
  }

  async verify_pin_status(hash: string): Promise<PinStatusResponseDto> {
    const pinned = this.pinMetadata.get(hash);

    if (!pinned) {
      // Unknown hash — try checking the IPFS API if configured
      const apiKey = this.configService.get<string>('IPFS_API_KEY');
      const apiUrl = this.configService.get<string>('IPFS_API_URL');

      if (apiKey && apiUrl) {
        try {
          const resp = await fetch(
            `${apiUrl}/data/pinList?hashContains=${hash}&status=pinned`,
            { headers: { Authorization: `Bearer ${apiKey}` } },
          );
          if (resp.ok) {
            const data = (await resp.json()) as { count: number };
            if (data.count > 0) {
              return {
                hash,
                isPinned: true,
                gatewayReachable: true,
              };
            }
          }
        } catch (err) {
          this.logger.warn(
            `IPFS pin status check failed for hash ${hash}: ${err}`,
          );
        }
      }

      return { hash, isPinned: false, gatewayReachable: false };
    }

    const gateway = this.configService.get<string>(
      'IPFS_GATEWAY',
      'https://ipfs.io/ipfs',
    );
    const url = `${gateway}/${hash}`;

    // Probe the gateway URL for reachability
    let gatewayReachable = false;
    try {
      const probe = await fetch(url, { method: 'HEAD' });
      gatewayReachable = probe.ok;
    } catch {
      gatewayReachable = false;
    }

    return {
      hash,
      isPinned: true,
      eventId: pinned.eventId,
      url: pinned.url,
      pinnedAt: pinned.pinnedAt,
      gatewayReachable,
    };
  }

  async migrate_unpinned_assets(
    dto: MigrateUnpinnedAssetsDto,
  ): Promise<MigrateUnpinnedAssetsResponseDto> {
    const apiKey = this.configService.get<string>('IPFS_API_KEY');
    const apiUrl = this.configService.get<string>('IPFS_API_URL');

    if (!apiKey || !apiUrl) {
      throw new BadRequestException(
        'IPFS pinning is not configured. Set IPFS_API_URL and IPFS_API_KEY environment variables.',
      );
    }

    // Find assets associated with this event in our in-memory metadata
    const eventHashes: string[] = [];
    for (const [hash, meta] of this.pinMetadata.entries()) {
      if (meta.eventId === dto.eventId) {
        eventHashes.push(hash);
      }
    }

    // Also check the IPFS API for any pinned items we may have missed
    let remotePinnedHashes: string[] = [];
    try {
      const resp = await fetch(
        `${apiUrl}/data/pinList?status=pinned&metadata[keyvalues][eventId]=${encodeURIComponent(dto.eventId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (resp.ok) {
        const data = (await resp.json()) as {
          rows: Array<{ ipfs_pin_hash: string }>;
        };
        remotePinnedHashes = data.rows.map((r) => r.ipfs_pin_hash);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to fetch remote pin list for event ${dto.eventId}: ${err}`,
      );
    }

    const allKnownHashes = new Set([...eventHashes, ...remotePinnedHashes]);
    const alreadyPinned = remotePinnedHashes.length;
    const unpinnedHashes = [...allKnownHashes].filter(
      (h) => !remotePinnedHashes.includes(h),
    );

    if (dto.dryRun) {
      return {
        eventId: dto.eventId,
        totalAssets: allKnownHashes.size,
        alreadyPinned,
        migrated: 0,
        failed: 0,
        dryRun: true,
        migratedHashes: unpinnedHashes,
      };
    }

    let migrated = 0;
    let failed = 0;
    const migratedHashes: string[] = [];

    for (const hash of unpinnedHashes) {
      try {
        const resp = await fetch(`${apiUrl}/pinning/pinByHash`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            hashToPin: hash,
            pinataMetadata: {
              name: hash,
              keyvalues: { eventId: dto.eventId },
            },
          }),
        });

        if (resp.ok) {
          migrated++;
          migratedHashes.push(hash);
          this.logger.log(
            `Migrated pin for hash ${hash} (event ${dto.eventId})`,
          );
        } else {
          failed++;
          this.logger.warn(
            `Failed to migrate hash ${hash}: ${resp.statusText}`,
          );
        }
      } catch (err) {
        failed++;
        this.logger.warn(`Error migrating hash ${hash}: ${err}`);
      }
    }

    return {
      eventId: dto.eventId,
      totalAssets: allKnownHashes.size,
      alreadyPinned,
      migrated,
      failed,
      dryRun: false,
      migratedHashes,
    };
  }
}
