/**
 * Module-load smoke test: requiring these files evaluates their class decorators,
 * so an undefined identifier (e.g. a missing `Role` import or a nonexistent
 * CronExpression member) throws here instead of at application start.
 */
describe('module load smoke test', () => {
  const files = [
    './fraud-detection/fraud-detection.controller',
    './pass-packages/pass-packages.controller',
    './exchange-rates/exchange-rates.service',
    './sponsors/sponsors.controller',
    './sponsors/sponsors.service',
    './categories/categories.module',
    './categories/categories.service',
    './telemetry/dto/record-metric-datapoint.dto',
  ];

  it.each(files)('%s loads without throwing', (file) => {
    jest.isolateModules(() => {
      expect(() => require(file)).not.toThrow();
    });
  });

  it('SponsorsController handlers have unique names', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { EventSponsorsController } = require('./sponsors/sponsors.controller');
      const names = Object.getOwnPropertyNames(EventSponsorsController.prototype);
      expect(new Set(names).size).toBe(names.length);
      expect(names).toEqual(expect.arrayContaining(['getLeaderboard', 'listEventSponsors']));
    });
  });
});
