'use client';

import DOMPurify from 'dompurify';
import { useSyncExternalStore } from 'react';

/** 幻灯片富文本允许的内联 style 属性名。 */
const CSS_PROPERTIES = new Set([
  'color', 'background-color', 'font-size', 'font-family', 'font-weight', 'font-style',
  'text-align', 'text-decoration', 'line-height', 'letter-spacing', 'white-space', 'vertical-align',
  'display', 'position', 'top', 'left', 'right', 'bottom', 'height', 'width', 'min-width',
  'margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom',
  'padding', 'padding-left', 'padding-right',
  'border-top-width', 'border-bottom-width', 'border-color', 'border-style', 'opacity',
]);

/** 保留 KaTeX / 数学排版相关 class，过滤模型可能生成的 utility class。 */
const KATEX_CLASS = /^(katex(?:-[\w-]+)?|mord|mop|mbin|mrel|mopen|mclose|mpunct|minner|mspace|mathnormal|mathit|mathbb|mathrm|mathbf|text|base|strut|vlist(?:-[\w-]+)?|pstrut|sizing|reset-size\d+|size\d+|mtight|nulldelimiter|delimsizing|accent-body|accent|sqrt|root|frac-line|hide-tail|svg-align|stretchy|overlay|msupsub|op-symbol|small-op|large-op)$/u;

const DOMPURIFY_CONFIG: Parameters<typeof DOMPurify.sanitize>[1] = {
  USE_PROFILES: { html: true, mathMl: true, svg: true },
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'img', 'video', 'audio', 'form', 'input', 'button', 'a', 'foreignObject', 'animate', 'set'],
  FORBID_ATTR: ['href', 'xlink:href', 'src', 'srcset', 'id', 'name'],
  ALLOW_DATA_ATTR: false,
};

let configured = false;

/** 注册全局 hook：收紧 class 与 style，仅执行一次。 */
function configure() {
  if (configured) return;
  configured = true;

  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'class') {
      data.attrValue = data.attrValue.split(/\s+/).filter((name) => KATEX_CLASS.test(name)).join(' ');
    }
    if (data.attrName === 'style') {
      const style = document.createElement('span').style;
      style.cssText = data.attrValue;
      const clean: string[] = [];
      for (const property of Array.from(style)) {
        const value = style.getPropertyValue(property);
        if (CSS_PROPERTIES.has(property) && !/url\s*\(|expression\s*\(|@|\\/i.test(value)
          && (property !== 'position' || ['relative', 'static'].includes(value))) {
          clean.push(property + ':' + value);
        }
      }
      data.attrValue = clean.join(';');
    }
  });
}

/** 在浏览器内净化幻灯片 HTML；SSR 无 window 时返回空字符串。 */
export function sanitizeSlideHtml(html: string): string {
  if (typeof window === 'undefined' || !DOMPurify.sanitize) return '';
  configure();
  return DOMPurify.sanitize(html, DOMPURIFY_CONFIG);
}

const subscribe = () => () => {};

/**
 * 与 SSR 对齐：服务端快照为空，水合后在客户端再净化。
 * subscribe 恒为空，仅依赖客户端 getServerSnapshot / getSnapshot 分叉。
 */
export function useSanitizedSlideHtml(html: string): string {
  return useSyncExternalStore(subscribe, () => sanitizeSlideHtml(html), () => '');
}