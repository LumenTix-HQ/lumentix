import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class DecentralizedStorageService {
  private readonly pinnedMedia = new Map<string, { eventId: string; url: string; pinnedAt: Date }>();

  async upload_media_to_decentralized_storage(eventId: string, fileName: string, mimeType: string, content: string) {
    // Simulate IPFS content hash (CID)
    const hash = 'Qm' + crypto.createHash('sha256').update(content + fileName).digest('hex').substring(0, 44);
    const gateway = process.env.IPFS_GATEWAY ?? 'https://ipfs.io/ipfs';
    return { hash, url: `${gateway}/${hash}`, eventId, fileName, mimeType, uploaded: true };
  }

  pin_event_media(eventId: string, hash: string) {
    const gateway = process.env.IPFS_GATEWAY ?? 'https://ipfs.io/ipfs';
    const url = `${gateway}/${hash}`;
    this.pinnedMedia.set(hash, { eventId, url, pinnedAt: new Date() });
    return { hash, eventId, pinned: true, url };
  }

  retrieve_media_by_hash(hash: string) {
    const gateway = process.env.IPFS_GATEWAY ?? 'https://ipfs.io/ipfs';
    const pinned = this.pinnedMedia.get(hash);
    if (!pinned) throw new NotFoundException(`Media with hash "${hash}" not found`);
    return { ...pinned, hash, url: `${gateway}/${hash}` };
  }
}
