import {
  strictCspDirectives,
  swaggerCspDirectives,
} from './security.config';

describe('CSP directives', () => {
  it('does not allow inline or remote scripts in the strict policy', () => {
    expect(strictCspDirectives.scriptSrc).toEqual(["'self'"]);
    expect(strictCspDirectives.objectSrc).toEqual(["'none'"]);
    expect(strictCspDirectives.frameAncestors).toEqual(["'none'"]);
    expect(strictCspDirectives.baseUri).toEqual(["'self'"]);
  });

  it('only the swagger policy permits inline scripts', () => {
    expect(swaggerCspDirectives.scriptSrc).toContain("'unsafe-inline'");
    expect(JSON.stringify(strictCspDirectives)).not.toContain('unsafe-inline');
  });
});
