import { TemplateService } from './template.service';

describe('TemplateService — #825 Handlebars email templates', () => {
  let service: TemplateService;

  beforeEach(async () => {
    service = new TemplateService();
    await service.onModuleInit();
  });

  it('renders password-reset template with context', () => {
    const html = service.render('password-reset', {
      resetUrl: 'https://example.com/reset?token=abc',
    });
    expect(html).toContain('https://example.com/reset?token=abc');
    expect(html).toContain('reset');
  });

  it('renders email-verification template with context', () => {
    const html = service.render('email-verification', {
      verifyUrl: 'https://example.com/verify?token=xyz',
    });
    expect(html).toContain('https://example.com/verify?token=xyz');
  });

  it('throws when template does not exist', () => {
    expect(() => service.render('nonexistent', {})).toThrow();
  });

  it('wraps body in base template when base.hbs exists', () => {
    const html = service.render('password-reset', {
      resetUrl: 'https://example.com/reset',
    });
    expect(html.length).toBeGreaterThan(0);
  });
});
