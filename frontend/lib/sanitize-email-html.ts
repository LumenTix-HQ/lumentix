/**
 * Allow-list sanitizer for organizer-authored email HTML (issue #1156).
 *
 * The email composer renders `bodyHtml` straight into the DOM through
 * `dangerouslySetInnerHTML`, which is a self-XSS vector (and, once a campaign
 * body can come from anywhere other than the author's own textarea, a stored
 * XSS vector) unless the markup is scrubbed first. This module takes a
 * dependency-free, allow-list approach: it keeps only the tags and attributes
 * a legitimate promotional email actually needs and drops everything else —
 * including script tags, event-handler attributes, embedded media, and
 * `javascript:` URLs.
 */

/** Tags permitted in a marketing email. Formatting plus structure. */
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "hr",
  "div",
  "span",
  "a",
  "img",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "blockquote",
  "pre",
  "code",
  "small",
  "sub",
  "sup",
  "font",
  "center",
]);

/** Attributes permitted on all elements. */
const GLOBAL_ALLOWED_ATTRS = new Set([
  "align",
  "class",
  "style",
  "color",
  "dir",
]);

/** Attributes permitted only on specific tags. */
const TAG_ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "srcset", "alt", "width", "height", "title", "loading"]),
  td: new Set(["colspan", "rowspan", "width", "style"]),
  th: new Set(["colspan", "rowspan", "width", "style"]),
  font: new Set(["size", "face"]),
};

const UNSAFE_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "link",
  "meta",
  "base",
  "svg",
  "math",
  "video",
  "audio",
  "source",
]);

/** Destructive: runs after parsing, before the allow-list walk. */
const BLACKLISTED = [
  "onabort",
  "onactivate",
  "onafterprint",
  "onanimationcancel",
  "onanimationend",
  "onanimationiteration",
  "onanimationstart",
  "onbeforeprint",
  "onbeforeunload",
  "onblur",
  "oncanplay",
  "oncanplaythrough",
  "onchange",
  "onclick",
  "onclose",
  "oncontextmenu",
  "oncopy",
  "oncuechange",
  "oncut",
  "ondblclick",
  "ondrag",
  "ondragend",
  "ondragenter",
  "ondragleave",
  "ondragover",
  "ondragstart",
  "ondrop",
  "ondurationchange",
  "onended",
  "onerror",
  "onfocus",
  "onhashchange",
  "oninput",
  "oninvalid",
  "onkeydown",
  "onkeypress",
  "onkeyup",
  "onload",
  "onloadeddata",
  "onloadedmetadata",
  "onloadstart",
  "onmessage",
  "onmousedown",
  "onmouseenter",
  "onmouseleave",
  "onmousemove",
  "onmouseover",
  "onmouseout",
  "onmouseup",
  "onmousewheel",
  "onoffline",
  "ononline",
  "onpagehide",
  "onpageshow",
  "onpaste",
  "onpause",
  "onplay",
  "onplaying",
  "onpointercancel",
  "onpointerdown",
  "onpointerenter",
  "onpointerleave",
  "onpointermove",
  "onpointerout",
  "onpointerover",
  "onpointerup",
  "onpopstate",
  "onprogress",
  "onratechange",
  "onreset",
  "onresize",
  "onscroll",
  "onsearch",
  "onseeked",
  "onseeking",
  "onselect",
  "onshow",
  "onstalled",
  "onstorage",
  "onsubmit",
  "onsuspend",
  "ontimeupdate",
  "ontoggle",
  "ontouchcancel",
  "ontouchend",
  "ontouchmove",
  "ontouchstart",
  "onunload",
  "onvolumechange",
  "onwaiting",
  "onwheel",
];

const URL_ATTRS = new Set(["href", "src", "srcset"]);

/** Schemes a marketing email link or image may legitimately use. */
const ALLOWED_URL_SCHEMES = new Set(["http", "https", "mailto", "cid"]);

/**
 * Remove every ASCII whitespace and control character. Browsers ignore these
 * inside a URL scheme, so `java\tscript:`, `java\nscript:` and `java script:`
 * all execute even though a plain `startsWith("javascript:")` misses them.
 */
function normalizeForSchemeCheck(url: string): string {
  return url.replace(/[\u0000-\u0020]/g, "").toLowerCase();
}

/**
 * True when the URL does not use an allow-listed scheme. Obfuscated
 * `javascript:` payloads are unmasked first, then the scheme is allow-listed
 * rather than block-listed so unknown schemes (data:, vbscript:, blob:, ...)
 * fail closed.
 */
function isUnsafeUrl(url: string): boolean {
  if (!url) return false;
  const normalized = normalizeForSchemeCheck(url);
  const schemeMatch = normalized.match(/^([a-z][a-z0-9+.-]*):/);
  // No scheme at all → a relative URL (e.g. "/unsubscribe"); nothing can smuggle
  // executable code through a scheme that isn't there.
  if (!schemeMatch) return false;
  return !ALLOWED_URL_SCHEMES.has(schemeMatch[1]);
}

/** True when a `srcset` list contains any URL using a non-allow-listed scheme. */
function isUnsafeSrcset(value: string): boolean {
  return value.split(",").some((candidate) => {
    const [url] = candidate.trim().split(/\s+/);
    return isUnsafeUrl(url ?? "");
  });
}

/**
 * True when one CSS declaration is unsafe. Any backslash is rejected because
 * CSS escapes can rebuild a dangerous token (`java\73 cript:`), and every
 * `url()` must point at http(s).
 */
function isUnsafeCssDeclaration(declaration: string): boolean {
  if (declaration.includes("\\")) return true;
  if (/expression\s*\(/i.test(declaration) || /@import/i.test(declaration)) {
    return true;
  }
  const urlFn = /url\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = urlFn.exec(declaration)) !== null) {
    const target = declaration
      .slice(match.index + match[0].length)
      .replace(/^[\s'"]+/, "");
    if (!/^https?:/i.test(target)) return true;
  }
  return false;
}

/**
 * Strip individual risky declarations from a CSS string (`expression(...)`,
 * `url(...)` that isn't http(s), backslash escapes, `@import`) while keeping
 * the harmless remainder.
 */
function scrubCss(style: string): string {
  return style
    .split(";")
    .filter((decl) => decl.trim() && !isUnsafeCssDeclaration(decl))
    .join(";");
}

/**
 * Sanitize raw email HTML to a safe subset. Returns an HTML string; when the
 * platform has no DOM (SSR) it returns the input unchanged so the server build
 * never throws — the browser-side render is where the sanitizer runs.
 */
export function sanitizeEmailHtml(markup: string): string {
  if (!markup) return "";
  if (typeof document === "undefined") return markup;

  const template = document.createElement("template");
  template.innerHTML = markup;

  const doc = template.content.ownerDocument;
  const walker = doc.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);

  const toRemove: Element[] = [];

  let node = walker.nextNode();
  while (node) {
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (UNSAFE_TAGS.has(tag) || !ALLOWED_TAGS.has(tag)) {
      toRemove.push(el);
    } else {
      const allowedAttrs = TAG_ALLOWED_ATTRS[tag] ?? new Set<string>();
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const isEventHandler = name.startsWith("on") && BLACKLISTED.includes(name);
        const allowed =
          GLOBAL_ALLOWED_ATTRS.has(name) || allowedAttrs.has(name);
        const urlAttr =
          URL_ATTRS.has(name) &&
          (name === "srcset"
            ? isUnsafeSrcset(attr.value)
            : isUnsafeUrl(attr.value));
        if (name === "style") {
          const safeStyle = scrubCss(attr.value);
          if (safeStyle) {
            el.setAttribute(attr.name, safeStyle);
          } else {
            el.removeAttribute(attr.name);
          }
        } else if (!allowed || isEventHandler || urlAttr) {
          el.removeAttribute(attr.name);
        }
      }
      // Anchors that keep a target must not hand the opener reference to the
      // destination (reverse tabnabbing), so force a safe rel.
      if (tag === "a") {
        if (el.hasAttribute("target")) {
          el.setAttribute("rel", "noopener noreferrer");
        }
        // Anchor with an href removed is indistinguishable from a placeholder;
        // keep the text but drop the navigation.
        if (el.hasAttribute("href")) {
          const href = (el.getAttribute("href") ?? "").trim();
          if (!href || href.startsWith("#")) {
            el.removeAttribute("href");
          }
        }
      }
    }

    node = walker.nextNode();
  }

  for (const el of toRemove) {
    // Keep text content for most inline scrap (span/div), but never for
    // active content classes.
    const tag = el.tagName.toLowerCase();
    if (["script", "style", "iframe", "object", "embed", "video", "audio", "svg", "math"].includes(tag)) {
      el.remove();
    } else {
      el.replaceWith(...Array.from(el.childNodes));
    }
  }

  return template.innerHTML;
}