import { BruteForceService } from './brute-force.service';

describe('BruteForceService account keys', () => {
  it('normalises account identifiers', () => {
    expect(BruteForceService.accountSubject(' User@Example.com ')).toBe(
      'account:user@example.com',
    );
  });
});
