// Ambient types for jest-axe (no @types package is published). This file must
// NOT contain a top-level import/export, otherwise `declare module` becomes a
// module augmentation instead of a global ambient declaration.
declare module 'jest-axe' {
  export function axe(html: Element | string, options?: unknown): Promise<unknown>;
  export function configureAxe(options?: unknown): typeof axe;
  export const toHaveNoViolations: {
    toHaveNoViolations(received: unknown): { pass: boolean; message: () => string };
  };
}
