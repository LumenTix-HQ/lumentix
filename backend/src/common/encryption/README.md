# Encryption Module

Provides envelope encryption via a swappable `EncryptionProvider` interface.

## Architecture

```
EncryptionService (application-facing)
        │
        ▼
EncryptionProvider (interface — swap via DI)
        │
        ├── LocalEncryptionProvider  (AES-256-GCM — default, dev/test)
        └── KmsEncryptionProvider    (future: AWS KMS / HashiCorp Vault)
```

- **EncryptionService** — inject this into your services. It delegates to the
  configured provider.
- **EncryptionProvider** — interface with `encrypt(plaintext): string` and
  `decrypt(ciphertext): string`.
- **LocalEncryptionProvider** — uses AES-256-GCM with a SHA-256-derived key
  from `ESCROW_ENCRYPTION_SECRET`. Output format: `iv:authTag:ciphertext` (hex).

## Usage

```typescript
import { EncryptionService } from '../common/encryption';

@Injectable()
export class MyService {
  constructor(private readonly encryption: EncryptionService) {}

  storeSecret(plaintext: string): string {
    return this.encryption.encrypt(plaintext);
  }

  retrieveSecret(ciphertext: string): string {
    return this.encryption.decrypt(ciphertext);
  }
}
```

## Swapping the Provider (Production)

1. Implement `EncryptionProvider` in a new class (e.g., `KmsEncryptionProvider`).
2. Register it in `EncryptionModule` under the `ENCRYPTION_PROVIDER` token.
3. No service-level code changes needed.

## Migration

`EscrowService` previously called `encrypt()` / `decrypt()` directly from
`encryption.util.ts`. It now injects `EncryptionService`. The
`LocalEncryptionProvider` is fully backward-compatible with the existing
`iv:authTag:ciphertext` format.

## Tests

```bash
npx jest src/common/encryption
```
