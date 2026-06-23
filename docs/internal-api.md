# Internal API — Request Signing Protocol

Routes under the `/internal/*` prefix are reserved for service-to-service calls
within the LumenTix platform. They are protected by HMAC-SHA256 request signing
and are **not** accessible to end-users.

---

## How it works

Every request to an `/internal/*` endpoint must include two custom headers:

| Header | Description |
|---|---|
| `X-Timestamp` | Current Unix epoch in **milliseconds**, as a decimal string |
| `X-Internal-Signature` | Hex-encoded HMAC-SHA256 signature (see below) |

### Signature algorithm

```
signature = HMAC-SHA256(
  key     = INTERNAL_SECRET,
  message = "${X-Timestamp}:${rawRequestBody}"
)
```

- For requests with no body (GET, DELETE), use an empty string `""` as `rawRequestBody`.
- The colon `:` separator is always present even when the body is empty.
- The result is encoded as a lowercase hexadecimal string.

### Timestamp freshness

The receiving service (`InternalSignatureGuard`) rejects requests whose
`X-Timestamp` is more than **30 seconds** old relative to the server's clock.
Ensure clocks are synchronised (NTP) across all services.

---

## Environment variable

```
INTERNAL_SECRET=change_me_in_production
```

Set this to a cryptographically random string of at least 32 characters.
All services that need to call or serve `/internal/*` routes must share the
same value.

---

## NestJS implementation

### Protecting a route

Apply `InternalSignatureGuard` to any controller that serves internal routes:

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { InternalSignatureGuard } from '../common/guards/internal-signature.guard';

@Controller('internal/tickets')
@UseGuards(InternalSignatureGuard)
export class InternalTicketsController {
  @Get('health')
  health() {
    return { ok: true };
  }
}
```

### Making a signed request

Inject `InternalHttpClientService` and use its methods — signing is automatic:

```typescript
import { Injectable } from '@nestjs/common';
import { InternalHttpClientService } from '../common/http/internal-http-client.service';

@Injectable()
export class SomeService {
  constructor(private readonly http: InternalHttpClientService) {}

  async notifyOtherService(payload: unknown) {
    return this.http.post('http://other-service/internal/notify', payload);
  }
}
```

---

## Security notes

- Never expose `/internal/*` routes through the public API gateway / load balancer.
- Rotate `INTERNAL_SECRET` periodically and on suspected compromise.
- The 30-second replay window is intentionally short; expand only if clock skew
  across your deployment is consistently larger than this threshold.
