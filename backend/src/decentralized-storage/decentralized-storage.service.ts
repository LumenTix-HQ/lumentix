import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IpfsPinningService } from './ipfs-pinning.service';

/**
 * Real IPFS pinning integration via configurable provider.
 *
 * Uploads through the Pinata file API, then replicates the CID through
 * independently configured IPFS Pinning Service API providers.
 */
@Injectable()
export class DecentralizedStorageService {
  private readonly logger = new Logger(DecentralizedStorageService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly pinning: IpfsPinningService,
  ) {}

  async upload_media_to_decentralized_storage(
    eventId: string,
    fileName: string,
    mimeType: string,
    content: string,
    contentEncoding: 'utf8' | 'base64' = 'utf8',
  ) {
    this.pinning.assertConfigured();
    const apiKey = this.configService.get<string>('IPFS_API_KEY');
    const apiUrl = this.configService.get<string>('IPFS_API_URL');

    if (!apiKey || !apiUrl) {
      throw new BadRequestException(
        'IPFS pinning is not configured. Set IPFS_API_URL and IPFS_API_KEY environment variables.',
      );
    }

    // Binary images/video must use base64 rather than UTF-8 text.
    if (
      contentEncoding === 'base64' &&
      (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        content,
      ) ||
        !content)
    ) {
      throw new BadRequestException('content must be base64 encoded');
    }
    const contentBuffer = Buffer.from(content, contentEncoding);
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
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    });

    if (!response.ok) {
      this.logger.error(`IPFS pin failed: ${response.status}`);
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

    const redundancy = await this.pinning.pin_to_ipfs(eventId, hash);
    return { ...redundancy, url, fileName, mimeType, uploaded: true };
  }

  async pin_event_media(eventId: string, hash: string) {
    const result = await this.pinning.pin_to_ipfs(eventId, hash);
    return { ...result, url: this.gatewayUrl(hash) };
  }

  async retrieve_media_by_hash(hash: string) {
    const result = await this.pinning.verify_pin_status(hash);
    if (result.providers.every((p) => p.status === 'missing')) {
      throw new NotFoundException('Stored media not found');
    }
    return { ...result, url: this.gatewayUrl(hash) };
  }

  private gatewayUrl(hash: string) {
    return `${this.configService.get<string>('IPFS_GATEWAY', 'https://ipfs.io/ipfs')}/${hash}`;
  }
}
