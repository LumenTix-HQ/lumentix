import { assertPublicHttpsUrl, isBlockedIp } from './safe-url';

describe('isBlockedIp', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    'fd00::1',
    '::ffff:10.0.0.1',
  ])('blocks %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it('allows public addresses', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('2606:4700:4700::1111')).toBe(false);
  });
});

describe('assertPublicHttpsUrl', () => {
  it('rejects non-https and internal targets', async () => {
    await expect(assertPublicHttpsUrl('http://example.com')).rejects.toThrow();
    await expect(
      assertPublicHttpsUrl('https://169.254.169.254/latest'),
    ).rejects.toThrow();
    await expect(assertPublicHttpsUrl('https://localhost/x')).rejects.toThrow();
  });

  it('accepts a public literal address', async () => {
    await expect(assertPublicHttpsUrl('https://8.8.8.8/hook')).resolves.toBeInstanceOf(URL);
  });
});
