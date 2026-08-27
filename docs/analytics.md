# Analytics

Lumentix uses privacy-respecting, cookie-free analytics compatible with [Plausible](https://plausible.io) or a self-hosted [Umami](https://umami.is) instance.

## Configuration

Set `NEXT_PUBLIC_ANALYTICS_URL` in your `.env.local` to point to your analytics instance:

```
NEXT_PUBLIC_ANALYTICS_URL=https://your-analytics-instance.example.com
```

If this variable is not set, no analytics scripts are loaded and no data is collected.

## Page views

Page views are tracked automatically on every Next.js route change via the `AnalyticsProvider` component in `app/layout.tsx`. No cookies are set.

## Custom events

| Event name          | When it fires                                      |
|---------------------|----------------------------------------------------|
| `wallet_connected`  | User successfully connects their Freighter wallet  |
| `payment_initiated` | User starts the payment flow                       |
| `payment_confirmed` | Stellar transaction is confirmed                   |
| `payment_failed`    | Payment fails for any reason                       |
| `refund_requested`  | User requests a refund                             |

### Usage in code

```typescript
import { analytics } from '@/lib/analytics/analytics';

analytics.walletConnected();
analytics.paymentInitiated('XLM');
analytics.paymentConfirmed('XLM');
analytics.paymentFailed('insufficient funds');
analytics.refundRequested();
```

## Opt-out

Users can opt out via the toggle in their profile page (`/profile`).

The preference is stored in `localStorage` under the key `lumentix_analytics_opt_out`. When set to `"true"`:

- No page-view events are sent
- No custom events are sent
- No analytics scripts are loaded

The opt-out is purely client-side; no server state is changed.
