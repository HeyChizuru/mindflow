'use client';

import DOMPurify from 'dompurify';
import { useSyncExternalStore } from 'react';

const CSS_PROPERTIES = new Set(['color', 'background-color', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-align', 'text-decoration', 'line-height', 'letter-spacing', 'white-space', 'vertical-align', 'display', 'position', 'top', 'left', 'right', 'bottom', 'height', 'width', 'min-width', 'margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'padding', 'padding-left', 'padding-right', 'border-top-width', 'border-bottom-width', 'border-color', 'border-style', 'opacity']);
let configured = false;
function configure() {
  if (configured) return;
  configured = true;
  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'class') {
      // Preserve KaTeX classes, never generated utility classes that can escape the slide.
      data.attrValue = data.attrValue.split(/\s+/).filter((name) => /^(katex(?:-[\w-]+)?|mord|mop|mbin|mrel|mopen|mclose|mpunct|minner|mspace|mathnormal|mathit|mathbb|mathrm|mathbf|text|base|strut|vlist(?:-[\w-]+)?|pstrut|sizing|reset-size\d+|size\d+|mtight|nulldelimiter|delimsizing|accent-body|accent|sqrt|root|frac-line|hide-tail|svg-align|stretchy|overlay|msupsub|op-symbol|small-op|large-op)$/u.test(name)).join(' ');
    }
    if (data.attrName === 'style') {
      const style = document.createElement('span').style;
      style.cssText = data.attrValue;
      const clean: string[] = [];
      for (const property of Array.from(style)) {
        const value = style.getPropertyValue(property);
        if (CSS_PROPERTIES.has(property) && !/url\s*\(|expression\s*\(|@|\\/i.test(value) &&
          (property !== 'position' || ['relative', 'static'].includes(value))) clean.push(property + ':' + value);
      }
      data.attrValue = clean.join(';');
    }
  });
}
export function sanitizeSlideHtml(html: string): string {
  if (typeof window === 'undefined' || !DOMPurify.sanitize) return '';
  configure();
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'img', 'video', 'audio', 'form', 'input', 'button', 'a', 'foreignObject', 'animate', 'set'],
    FORBID_ATTR: ['href', 'xlink:href', 'src', 'srcset', 'id', 'name'],
    ALLOW_DATA_ATTR: false,
  });
}
const subscribe = () => () => {};
/** Matching empty SSR/hydration snapshots; sanitized markup appears after hydration. */
export function useSanitizedSlideHtml(html: string): string {
  return useSyncExternalStore(subscribe, () => sanitizeSlideHtml(html), () => '');
}
