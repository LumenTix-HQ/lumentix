import { ConfigService } from '@nestjs/config';
import { DecentralizedStorageService } from './decentralized-storage.service';
import { IpfsPinningService } from './ipfs-pinning.service';

describe('Media uploads', () => {
  const originalFetch = global.fetch;
  const hash = `Qm${'a'.repeat(44)}`;
  const pinning = {
    assertConfigured: jest.fn(),
    pin_to_ipfs: jest
      .fn()
      .mockResolvedValue({ hash, pinned: false, providers: [] }),
  };
  const request = jest.fn<Promise<Response>, [string, RequestInit]>();
  const service = new DecentralizedStorageService(
    new ConfigService({
      IPFS_API_URL: 'https://upload.example',
      IPFS_API_KEY: 'test',
    }),
    pinning as unknown as IpfsPinningService,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    request.mockResolvedValue(new Response(JSON.stringify({ IpfsHash: hash })));
    global.fetch = request;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('preserves binary bytes and returns actual replica status', async () => {
    const bytes = Buffer.from([0, 255, 128, 1]);
    const result = await service.upload_media_to_decentralized_storage(
      'event',
      'image.png',
      'image/png',
      bytes.toString('base64'),
      'base64',
    );
    const form = request.mock.calls[0][1].body as FormData;
    const file = form.get('file') as Blob;
    expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);
    expect(result.uploaded).toBe(true);
    expect(result.pinned).toBe(false);
    expect(pinning.pin_to_ipfs).toHaveBeenCalledWith('event', hash);
  });

  it('preserves existing UTF-8 callers', async () => {
    await service.upload_media_to_decentralized_storage(
      'event',
      'flyer.txt',
      'text/plain',
      'Hello',
    );
    const form = request.mock.calls[0][1].body as FormData;
    expect(await (form.get('file') as Blob).text()).toBe('Hello');
  });

  it('rejects malformed base64 before uploading', async () => {
    await expect(
      service.upload_media_to_decentralized_storage(
        'event',
        'image.png',
        'image/png',
        '%bad',
        'base64',
      ),
    ).rejects.toThrow('base64');
    expect(request).not.toHaveBeenCalled();
  });
});
