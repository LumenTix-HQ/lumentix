import { isDefiniteStellarFailure } from './sponsors.service';

describe('isDefiniteStellarFailure', () => {
  it('treats Horizon 4xx as a definite failure', () => {
    expect(isDefiniteStellarFailure({ response: { status: 400 } })).toBe(true);
  });

  it('treats timeouts, 5xx and unknown errors as ambiguous', () => {
    expect(isDefiniteStellarFailure({ response: { status: 504 } })).toBe(false);
    expect(isDefiniteStellarFailure(new Error('timeout'))).toBe(false);
    expect(isDefiniteStellarFailure(undefined)).toBe(false);
  });
});
