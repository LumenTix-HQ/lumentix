import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  formatBytes,
  validateImageFile,
  uploadEventImage,
  ImageUploadError,
} from '@/lib/utils/image-upload';

function makeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('validateImageFile', () => {
  it('accepts a JPEG under the size limit', () => {
    expect(validateImageFile(makeFile('cover.jpg', 'image/jpeg', 1024))).toEqual({ ok: true });
  });

  it('accepts a PNG under the size limit', () => {
    expect(validateImageFile(makeFile('cover.png', 'image/png', 4_000_000))).toEqual({ ok: true });
  });

  it('rejects unsupported MIME types', () => {
    const result = validateImageFile(makeFile('doc.pdf', 'application/pdf', 1024));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/JPEG or PNG/);
  });

  it('rejects a GIF even though it is an image', () => {
    expect(validateImageFile(makeFile('anim.gif', 'image/gif', 1024)).ok).toBe(false);
  });

  it('falls back to the extension when the browser reports no MIME type', () => {
    expect(validateImageFile(makeFile('cover.PNG', '', 1024))).toEqual({ ok: true });
    expect(validateImageFile(makeFile('cover.bmp', '', 1024)).ok).toBe(false);
  });

  it('rejects files over 5 MB', () => {
    const result = validateImageFile(makeFile('big.jpg', 'image/jpeg', MAX_IMAGE_BYTES + 1));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/maximum size is 5 MB/);
  });

  it('rejects empty files', () => {
    expect(validateImageFile(makeFile('empty.jpg', 'image/jpeg', 0)).ok).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(MAX_IMAGE_BYTES)).toBe('5 MB');
    expect(formatBytes(1_500_000)).toBe('1.4 MB');
  });
});

// Minimal XMLHttpRequest double that lets each test drive the lifecycle.
class MockXhr {
  static instances: MockXhr[] = [];
  upload = { onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 200;
  response = '';
  responseType = '';
  method = '';
  url = '';
  sentBody: FormData | null = null;

  constructor() {
    MockXhr.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send(body: FormData) {
    this.sentBody = body;
  }

  abort() {
    this.onabort?.();
  }
}

describe('uploadEventImage', () => {
  beforeEach(() => {
    MockXhr.instances = [];
    vi.stubGlobal('XMLHttpRequest', MockXhr);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts multipart form data to the event image endpoint', async () => {
    const file = makeFile('cover.png', 'image/png', 1024);
    const promise = uploadEventImage({ eventId: 'evt-1', file });

    const xhr = MockXhr.instances[0];
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/proxy/events/evt-1/image');
    expect(xhr.sentBody?.get('file')).toBeInstanceOf(File);

    xhr.response = JSON.stringify({ imageUrl: '/uploads/cover.png' });
    xhr.onload?.();

    await expect(promise).resolves.toEqual({ imageUrl: '/uploads/cover.png' });
  });

  it('reports progress as bytes are flushed', async () => {
    const onProgress = vi.fn();
    const promise = uploadEventImage({
      eventId: 'evt-1',
      file: makeFile('cover.png', 'image/png', 1024),
      onProgress,
    });

    const xhr = MockXhr.instances[0];
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 256, total: 1024 });
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 768, total: 1024 });
    expect(onProgress).toHaveBeenNthCalledWith(1, 25);
    expect(onProgress).toHaveBeenNthCalledWith(2, 75);

    xhr.response = '{}';
    xhr.onload?.();
    await promise;
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it('rejects with the server message on a non-2xx response', async () => {
    const promise = uploadEventImage({
      eventId: 'evt-1',
      file: makeFile('cover.png', 'image/png', 1024),
    });

    const xhr = MockXhr.instances[0];
    xhr.status = 413;
    xhr.response = JSON.stringify({ message: 'File too large' });
    xhr.onload?.();

    await expect(promise).rejects.toMatchObject({ status: 413, message: 'File too large' });
    await expect(promise).rejects.toBeInstanceOf(ImageUploadError);
  });

  it('rejects on a network error', async () => {
    const promise = uploadEventImage({
      eventId: 'evt-1',
      file: makeFile('cover.png', 'image/png', 1024),
    });
    MockXhr.instances[0].onerror?.();
    await expect(promise).rejects.toMatchObject({ status: 0 });
  });

  it('aborts when the supplied signal fires', async () => {
    const controller = new AbortController();
    const promise = uploadEventImage({
      eventId: 'evt-1',
      file: makeFile('cover.png', 'image/png', 1024),
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('encodes the event id in the URL', () => {
    void uploadEventImage({
      eventId: 'evt/1 2',
      file: makeFile('cover.png', 'image/png', 1024),
    }).catch(() => undefined);
    expect(MockXhr.instances[0].url).toBe('/api/proxy/events/evt%2F1%202/image');
  });
});
