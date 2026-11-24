import { Keypair } from '@stellar/stellar-sdk';

/**
 * Verify a hex-encoded Ed25519 signature made by the holder of a Stellar
 * account. `publicKey` is the decoded "G..." strkey (never its raw characters).
 */
export function verifyStellarSignature(
  message: string,
  signatureHex: string,
  publicKey: string,
): boolean {
  try {
    if (!/^[0-9a-fA-F]{128}$/.test(signatureHex)) return false;
    const signature = Buffer.from(signatureHex, 'hex');
    return Keypair.fromPublicKey(publicKey).verify(
      Buffer.from(message, 'utf-8'),
      signature,
    );
  } catch {
    return false;
  }
}
