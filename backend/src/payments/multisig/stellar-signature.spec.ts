import { Keypair } from '@stellar/stellar-sdk';
import { verifyStellarSignature } from './stellar-signature';

describe('verifyStellarSignature', () => {
  const signer = Keypair.random();
  const sign = (message: string, kp: Keypair = signer) =>
    kp.sign(Buffer.from(message, 'utf-8')).toString('hex');

  it('accepts a genuine signature', () => {
    expect(
      verifyStellarSignature('payout-1', sign('payout-1'), signer.publicKey()),
    ).toBe(true);
  });

  it('rejects a signature over a different message', () => {
    expect(
      verifyStellarSignature('payout-2', sign('payout-1'), signer.publicKey()),
    ).toBe(false);
  });

  it('rejects a signature from a different key', () => {
    const other = Keypair.random();
    expect(
      verifyStellarSignature(
        'payout-1',
        sign('payout-1', other),
        signer.publicKey(),
      ),
    ).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(verifyStellarSignature('m', 'zz', signer.publicKey())).toBe(false);
    expect(verifyStellarSignature('m', sign('m'), 'not-a-key')).toBe(false);
  });
});
