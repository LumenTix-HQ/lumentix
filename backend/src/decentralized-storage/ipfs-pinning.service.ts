import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface Provider {
  name: string;
  url: string;
  token: string;
}
interface Pin {
  requestid: string;
  status: 'queued' | 'pinning' | 'pinned' | 'failed';
  created: string;
  pin: { cid: string; meta?: Record<string, string> };
}
export interface ProviderStatus {
  provider: string;
  status: Pin['status'] | 'missing' | 'unavailable';
  requestId?: string;
}

/** Uses the IPFS Pinning Service API; providers are the durable source of truth. */
@Injectable()
export class IpfsPinningService {
  constructor(private readonly config: ConfigService) {}

  private providers(): Provider[] {
    let providers: Provider[];
    try {
      providers = JSON.parse(
        this.config.get<string>('IPFS_PINNING_SERVICES', '[]'),
      ) as Provider[];
      if (
        !Array.isArray(providers) ||
        providers.length < 2 ||
        providers.some(
          (p) => !p.name || !p.token || new URL(p.url).protocol !== 'https:',
        ) ||
        new Set(providers.map((p) => p.name)).size !== providers.length ||
        new Set(providers.map((p) => new URL(p.url).hostname)).size !==
          providers.length
      )
        throw new Error();
    } catch {
      throw new ServiceUnavailableException(
        'Configure at least two independent IPFS_PINNING_SERVICES',
      );
    }
    return providers;
  }

  assertConfigured(): void {
    this.providers();
  }

  validateCid(cid: string) {
    // Common CIDv0 (base58btc) and CIDv1 (base32) encodings; no URL/path input.
    if (!/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,120})$/.test(cid)) {
      throw new BadRequestException('Expected an IPFS CID');
    }
  }

  private async request<T>(
    provider: Provider,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${provider.url.replace(/\/$/, '')}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${provider.token}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Pinning provider request failed');
    return response.json() as Promise<T>;
  }

  private async lookup(
    provider: Provider,
    cid: string,
  ): Promise<Pin | undefined> {
    const query = new URLSearchParams({
      cid,
      status: 'queued,pinning,pinned,failed',
      limit: '1000',
    });
    const data = await this.request<{ results: Pin[] }>(
      provider,
      `/pins?${query}`,
    );
    const pins = data.results.filter((p) => p.pin.cid === cid);
    return (
      pins.find((p) => p.status === 'pinned') ??
      pins.find((p) => p.status !== 'failed') ??
      pins[0]
    );
  }

  async verify_pin_status(cid: string) {
    this.validateCid(cid);
    const providers = await Promise.all(
      this.providers().map(async (provider): Promise<ProviderStatus> => {
        try {
          const pin = await this.lookup(provider, cid);
          return {
            provider: provider.name,
            status: pin?.status ?? 'missing',
            requestId: pin?.requestid,
          };
        } catch {
          return { provider: provider.name, status: 'unavailable' };
        }
      }),
    );
    return {
      hash: cid,
      pinned: providers.every((p) => p.status === 'pinned'),
      providers,
    };
  }

  async pin_to_ipfs(eventId: string, cid: string) {
    this.validateCid(cid);
    const providers = await Promise.all(
      this.providers().map(async (provider): Promise<ProviderStatus> => {
        try {
          let pin = await this.lookup(provider, cid);
          if (!pin || pin.status === 'failed') {
            pin = await this.request<Pin>(provider, '/pins', {
              cid,
              name: `event-${eventId}`,
              meta: { eventId },
            });
          }
          return {
            provider: provider.name,
            status: pin.status,
            requestId: pin.requestid,
          };
        } catch {
          return { provider: provider.name, status: 'unavailable' };
        }
      }),
    );
    return {
      hash: cid,
      eventId,
      pinned: providers.every((p) => p.status === 'pinned'),
      providers,
    };
  }

  async migrate_unpinned_assets(eventId: string, hashes: string[]) {
    // Validate the whole batch before causing any external writes.
    hashes.forEach((hash) => this.validateCid(hash));
    const results: Awaited<ReturnType<IpfsPinningService['pin_to_ipfs']>>[] =
      [];
    for (const hash of new Set(hashes))
      results.push(await this.pin_to_ipfs(eventId, hash));
    return { eventId, results };
  }
}
