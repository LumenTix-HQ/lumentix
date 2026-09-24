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