import { ConfigService } from '@nestjs/config';
import { IpfsPinningService } from './ipfs-pinning.service';

const cid = `Qm${'a'.repeat(44)}`;
const providers = [
  { name: 'one', url: 'https://one.example', token: 'test-one' },
  { name: 'two', url: 'https://two.example', token: 'test-two' },
];
const response = (data: unknown) => ({
  ok: true,
  json: () => Promise.resolve(data),
});
const pin = (status: string) => ({ requestid: 'pin-1', status, pin: { cid } });

describe('IPFS redundant pinning', () => {
  let service: IpfsPinningService;
  let fetchMock: jest.Mock<
    Promise<ReturnType<typeof response>>,
    [string, RequestInit]
  >;
  const originalFetch = global.fetch;
  beforeEach(() => {
    service = new IpfsPinningService(
      new ConfigService({ IPFS_PINNING_SERVICES: JSON.stringify(providers) }),
    );
    fetchMock = jest.fn<
      Promise<ReturnType<typeof response>>,
      [string, RequestInit]
    >();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('pins missing assets at both services and keeps queued status honest', async () => {
    fetchMock.mockImplementation((_url, init) =>
      Promise.resolve(
        response(init.method === 'GET' ? { results: [] } : pin('queued')),
      ),
    );
    const result = await service.pin_to_ipfs('event-1', cid);
    expect(result.pinned).toBe(false);
    expect(result.providers.map((p) => p.status)).toEqual(['queued', 'queued']);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init.method === 'POST'),
    ).toHaveLength(2);
  });

  it('verifies persistent provider state after service restart without a local cache', async () => {
    fetchMock.mockResolvedValue(response({ results: [pin('pinned')] }));
    expect((await service.verify_pin_status(cid)).pinned).toBe(true);
  });

  it('repairs a failed replica and preserves the healthy pin', async () => {
    fetchMock.mockImplementation((url, init) =>
      Promise.resolve(
        response(
          init.method === 'POST'
            ? pin('pinning')
            : {
                results: [
                  pin(url.includes('one.example') ? 'pinned' : 'failed'),
                ],
              },
        ),
      ),
    );
    const result = await service.migrate_unpinned_assets('event-1', [cid, cid]);
    expect(result.results).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init.method === 'POST'),
    ).toHaveLength(1);
    expect(result.results[0].pinned).toBe(false);
  });

  it('reports an unavailable provider instead of claiming redundancy', async () => {
    fetchMock.mockImplementation((url) =>
      url.includes('one.example')
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(response({ results: [pin('pinned')] })),
    );
    const result = await service.verify_pin_status(cid);
    expect(result.pinned).toBe(false);
    expect(result.providers[0].status).toBe('unavailable');
  });

  it('validates the entire migration before writing', async () => {
    await expect(
      service.migrate_unpinned_assets('event-1', [cid, '../../secret']),
    ).rejects.toThrow('CID');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed without independent providers', async () => {
    service = new IpfsPinningService(
      new ConfigService({ IPFS_PINNING_SERVICES: '[]' }),
    );
    await expect(service.pin_to_ipfs('event-1', cid)).rejects.toThrow(
      'at least two',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
