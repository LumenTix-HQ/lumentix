describe('data-source', () => {
  const env = { DB_USERNAME: 'u', DB_PASSWORD: 'p', DB_NAME: 'n' };

  it('exports exactly one DataSource instance (required by the TypeORM CLI)', () => {
    Object.assign(process.env, env);
    let moduleExports: Record<string, unknown> = {};
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      moduleExports = require('./data-source');
    });
    // instanceof is unreliable across jest.isolateModules, so match on shape.
    const instances = Object.values(moduleExports).filter(
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { initialize?: unknown }).initialize === 'function' &&
        'options' in (value as object),
    );
    expect(instances).toHaveLength(1);
    expect(moduleExports.default).toBeUndefined();
  });
});
