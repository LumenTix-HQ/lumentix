import { describe, it, expect } from 'vitest';
import { sanitizeEmailHtml } from '@/lib/sanitize-email-html';

describe('sanitizeEmailHtml', () => {
  it('strips script tags entirely', () => {
    const out = sanitizeEmailHtml('<p>Hello</p><script>window.pwned = true</script>');
    expect(out).not.toMatch(/script/);
    expect(out).not.toMatch(/pwned/);
  });

  it('strips inline event handlers from allowed tags', () => {
    const out = sanitizeEmailHtml('<img src="x.png" onerror="alert(1)"><a href="https://x.dev" onclick="steal()">go</a>');
    expect(out).not.toMatch(/onerror/);
    expect(out).not.toMatch(/onclick/);
    expect(out).toContain('src="x.png"');
    expect(out).toContain('href="https://x.dev"');
  });

  it('blocks javascript: URLs', () => {
    const out = sanitizeEmailHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain('click');
  });

  it('strips embedded and form controls markup', () => {
    const out = sanitizeEmailHtml('<iframe src="https://evil.example"></iframe><form><input name="x"></form><video src="v.mp4"></video>');
    expect(out).not.toMatch(/iframe/);
    expect(out).not.toMatch(/form/);
    expect(out).not.toMatch(/input/);
    expect(out).not.toMatch(/video/);
  });

  it('blocks data: src URLs (script smuggling)', () => {
    const out = sanitizeEmailHtml('<img src="data:text/html;base64,PHNjcmlwdD4="><img src="https://cdn.example/a.png">');
    expect(out).not.toMatch(/data:/i);
    expect(out).toContain('cdn.example');
  });

  it('keeps legitimate email structure and formatting', () => {
    const body =
      '<h1>Big sale!</h1><p>Up to <strong>50% off</strong> tickets.</p>' +
      '<ul><li>Workshops</li><li>Meetups</li></ul>' +
      '<table><tr><td>Row</td></tr></table>';
    const out = sanitizeEmailHtml(body);
    expect(out).toContain('<h1>');
    expect(out).toContain('<strong>');
    expect(out).toContain('<ul><li>');
    expect(out).toContain('<table>');
  });

  it('scrubs dangerous CSS from style attributes', () => {
    const out = sanitizeEmailHtml('<div style="color:red;background:url(javascript:alert(1))">x</div>');
    expect(out).not.toMatch(/javascript/i);
    expect(out).toContain('color:red');
  });
});

describe('sanitizeEmailHtml — obfuscated javascript: URLs (#1396)', () => {
  const obfuscated = [
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'java\rscript:alert(1)',
    'java script:alert(1)',
    '   javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
  ];

  it.each(obfuscated)('drops an obfuscated href %#', (payload) => {
    const out = sanitizeEmailHtml(`<a href="${payload}">click</a>`);
    expect(out).not.toContain('href');
    expect(out).toContain('click');
  });

  it('drops vbscript: URLs', () => {
    const out = sanitizeEmailHtml('<a href="vbscript:msgbox(1)">x</a>');
    expect(out).not.toContain('href');
    expect(out).not.toMatch(/vbscript/i);
  });

  it('drops data: URLs fail-closed', () => {
    const out = sanitizeEmailHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">');
    expect(out).not.toContain('src');
  });
});

describe('sanitizeEmailHtml — URL scheme allow-list (#1396)', () => {
  it('keeps http, https, mailto and cid', () => {
    expect(sanitizeEmailHtml('<a href="http://x.dev">a</a>')).toContain('href="http://x.dev"');
    expect(sanitizeEmailHtml('<a href="https://x.dev">a</a>')).toContain('href="https://x.dev"');
    expect(sanitizeEmailHtml('<a href="mailto:a@b.com">a</a>')).toContain('href="mailto:a@b.com"');
    expect(sanitizeEmailHtml('<img src="cid:logo">')).toContain('src="cid:logo"');
  });

  it('drops schemes that are not allow-listed', () => {
    expect(sanitizeEmailHtml('<a href="ftp://x.dev/a">a</a>')).not.toContain('href');
    expect(sanitizeEmailHtml('<a href="blob:https://x.dev/abc">a</a>')).not.toContain('href');
  });

  it('keeps relative URLs (no scheme to abuse)', () => {
    expect(sanitizeEmailHtml('<a href="/unsubscribe">u</a>')).toContain('href="/unsubscribe"');
  });
});

describe('sanitizeEmailHtml — target=_blank hardening (#1396)', () => {
  it('forces rel="noopener noreferrer" when target is kept', () => {
    const out = sanitizeEmailHtml('<a href="https://x.dev" target="_blank">x</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('overrides an attacker-supplied rel', () => {
    const out = sanitizeEmailHtml('<a href="https://x.dev" target="_blank" rel="opener">x</a>');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).not.toContain('rel="opener"');
  });

  it('leaves anchors without target alone', () => {
    const out = sanitizeEmailHtml('<a href="https://x.dev">x</a>');
    expect(out).not.toContain('rel=');
  });
});

describe('sanitizeEmailHtml — CSS hardening (#1396)', () => {
  it('drops declarations containing CSS backslash escapes', () => {
    const out = sanitizeEmailHtml(
      '<div style="color:red;background:url(java\\script:alert(1))">x</div>',
    );
    expect(out).not.toMatch(/script/i);
    expect(out).toContain('color:red');
  });

  it('drops url() declarations that are not http(s)', () => {
    const out = sanitizeEmailHtml(
      '<div style="color:blue;background:url(data:text/html,x);list-style:url(//evil.example/a.png)">x</div>',
    );
    expect(out).not.toMatch(/data:/i);
    expect(out).not.toContain('evil.example');
    expect(out).toContain('color:blue');
  });

  it('keeps http(s) url() declarations', () => {
    const out = sanitizeEmailHtml(
      '<div style="background:url(https://cdn.example/a.png)">x</div>',
    );
    expect(out).toContain('url(https://cdn.example/a.png)');
  });
});

describe('sanitizeEmailHtml — srcset hardening (#1396)', () => {
  it('drops the whole srcset when any candidate uses a bad scheme', () => {
    const out = sanitizeEmailHtml(
      '<img srcset="https://cdn.example/a.png 1x, javascript:alert(1) 2x">',
    );
    expect(out).not.toMatch(/javascript/i);
    expect(out).not.toContain('srcset');
  });

  it('keeps a fully http(s) srcset', () => {
    const out = sanitizeEmailHtml(
      '<img srcset="https://cdn.example/a.png 1x, https://cdn.example/a@2x.png 2x">',
    );
    expect(out).toContain('cdn.example/a.png');
    expect(out).toContain('srcset=');
  });
});
