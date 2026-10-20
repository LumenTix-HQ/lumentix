describe('data-source', () => {
  const env = { DB_USERNAME: 'u', DB_PASSWORD: 'p', DB_NAME: 'n' };

  it('exports exactly one DataSource instance (required by the TypeORM CLI)', () => {
    Object.assign(process.env, env);
    let moduleExports: Record<string, unknown> = {};
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      moduleExports = require('./data-source');
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DataSource } = require('typeorm');

    const instances = Object.values(moduleExports).filter((value) => value instanceof DataSource);
    expect(instances).toHaveLength(1);
    expect(moduleExports.default).toBeUndefined();
  });
});
