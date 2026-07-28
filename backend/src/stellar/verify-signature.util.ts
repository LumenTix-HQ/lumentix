import { Injectable, Logger } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import * as crypto from 'crypto';

/**
 * Verify a Stellar-signed challenge string.
 *
 * @param publicKey  The Stellar public key (G...) that allegedly signed the message
 * @param signature  Base64-encoded signature produced by the Stellar wallet
 * @param message    The original message that was signed (e.g. the nonce)
 * @returns          true if the signature is valid for the given message and public key
 */
export function verifySignature(
  publicKey: string,
  signature: string,
  message: string,
): boolean {
  try {
    const keypair = Keypair.fromPublicKey(publicKey);
    const messageBuffer = Buffer.from(message, 'utf8');
    const signatureBuffer = Buffer.from(signature, 'base64');
    return keypair.verify(messageBuffer, signatureBuffer);
  } catch (err) {
    Logger.warn(
      `Signature verification failed: ${(err as Error).message}`,
      'StellarService',
    );
    return false;
  }
}

/**
 * Generate a cryptographically random 32-byte nonce encoded as hex.
 */
export function generateNonce(): string {
  return crypto.randomBytes(32).toString('hex');
}
