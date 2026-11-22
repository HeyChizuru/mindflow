/**
 * 解析模型返回的 JSON，并在失败时按多种策略修复常见格式问题。
 */

import { jsonrepair } from 'jsonrepair';
import { createLogger } from '@/lib/logger';
const log = createLogger('Generation');

/** 未闭合的容器或字符串直接拒绝，避免语法修复“补全”残缺片段。 */
function hasCompleteJsonStructure(input: string): boolean {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const char of input.trim()) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString && char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{' || char === '[') stack.push(char);
    if (char === '}' || char === ']') {
      if (stack.pop() !== (char === '}' ? '{' : '[')) return false;
    }
  }
  return stack.length === 0 && !inString && !escaped;
}

function repairQuotedPropertyFragments(jsonStr: string): string {
  return jsonStr.replace(
    /([,{]\s*)"([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(true|false|null|[+-]?\d+(?:\.\d+)?)"(?=\s*[,}])/g,
    (_match, prefix, key, value) => `${prefix}"${key}": ${value}`,
  );
}

function logJsonParseError(stage: string, jsonStr: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const positionMatch = message.match(/position\s+(\d+)/i);
  const position = positionMatch ? Number(positionMatch[1]) : undefined;

  if (typeof position === 'number' && Number.isFinite(position)) {
    const start = Math.max(0, position - 120);
    const end = Math.min(jsonStr.length, position + 120);
    log.warn(
      `${stage} parse error at position ${position}: ${message}. Context: ${jsonStr
        .slice(start, end)
        .replace(/\n/g, '\\n')}`,
    );
    return;
  }

  log.warn(`${stage} parse error: ${message}`);
}

export function parseJsonResponse<T>(response: string): T | null {
  // 先检查整段响应，再提取“看起来完整”的内层块；否则可能接受已闭合对象 + 尾部截断。
  if (!hasCompleteJsonStructure(response)) {
    log.warn('Incomplete JSON response; refusing to extract an inner fragment');
    return null;
  }
  // 策略 1：从 Markdown 代码块中提取（可能有多段）
  const codeBlockMatches = response.matchAll(/```(?:json)?\s*([\s\S]*?)```/g);
  for (const match of codeBlockMatches) {
    const extracted = match[1].trim();
    // 仅当以 { 或 [ 开头时才尝试
    if (extracted.startsWith('{') || extracted.startsWith('[')) {
      const result = tryParseJson<T>(extracted);
      if (result !== null) {
        log.info('Successfully parsed JSON from code block');
        return result;
      }
    }
  }

  // 策略 2：在正文中定位 JSON（无代码块）
  const jsonStartArray = response.indexOf('[');
  const jsonStartObject = response.indexOf('{');

  if (jsonStartArray !== -1 || jsonStartObject !== -1) {
    // 取最先出现的 [ 或 {
    const startIndex =
      jsonStartArray === -1
        ? jsonStartObject
        : jsonStartObject === -1
          ? jsonStartArray
          : Math.min(jsonStartArray, jsonStartObject);

    // 扫描到匹配的闭合括号
    let depth = 0;
    let endIndex = -1;
    let inString = false;
    let escapeNext = false;

    for (let i = startIndex; i < response.length; i++) {
      const char = response[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '[' || char === '{') depth++;
        else if (char === ']' || char === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i;
            break;
          }
        }
      }
    }

    if (endIndex !== -1) {
      const jsonStr = response.substring(startIndex, endIndex + 1);
      const result = tryParseJson<T>(jsonStr);
      if (result !== null) {
        log.info('Successfully parsed JSON from response body');
        return result;
      }
    }
  }

  // 策略 3：最后尝试整段 trim 后的原文
  const result = tryParseJson<T>(response.trim());
  if (result !== null) {
    log.info('Successfully parsed raw response as JSON');
    return result;
  }

  log.error('Failed to parse JSON from response');
  log.error('Raw response (first 500 chars):', response.substring(0, 500));
  log.error(
    'Raw response (last 500 chars):',
    response.substring(Math.max(0, response.length - 500)),
  );

  return null;
}

/** 依次尝试直接解析与多种常见 AI 输出修复手段。 */
export function tryParseJson<T>(jsonStr: string): T | null {
  // 尝试 1：原样 parse
  try {
    return JSON.parse(jsonStr) as T;
  } catch (error) {
    logJsonParseError('Attempt 1', jsonStr, error);
  }

  if (!hasCompleteJsonStructure(jsonStr)) {
    log.warn('Incomplete JSON response; refusing to recover a partial result');
    return null;
  }

  // 尝试 2：修正 AI 常见 JSON 问题
  try {
    let fixed = jsonStr;

    // 修复 0：对象内误写成整段字符串的键值片段，例如：
    // `"height: 76"` -> `"height": 76`，`"fixedRatio: false"` -> `"fixedRatio": false`
    // 前后文 [,{ 与 ,} 约束避免破坏合法 JSON 字符串。
    fixed = repairQuotedPropertyFragments(fixed);

    // 修复 1：字符串内的 LaTeX 反斜杠（\frac、\left 等），需加倍转义；
    // 合法 JSON 转义 \b \f \n \r \t \u 保持不变。
    fixed = fixed.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (_match, content) => {
      const fixedContent = content.replace(/\\([a-zA-Z])/g, (_m: string, ch: string) => {
        if ('bfnrtu'.includes(ch)) return `\\${ch}`;
        return `\\\\${ch}`;
      });
      return `"${fixedContent}"`;
    });

    // 修复 2：其余非法转义（如 \S）；合法集合：\" \\ \/ \b \f \n \r \t \uXXXX
    fixed = fixed.replace(/\\([^"\\\/bfnrtu\n\r])/g, (match, char) => {
      if (/[a-zA-Z]/.test(char)) {
        return '\\\\' + char;
      }
      return match;
    });

    return JSON.parse(fixed) as T;
  } catch (error) {
    logJsonParseError('Attempt 2', jsonStr, error);
  }

  // 尝试 3：jsonrepair（如中文文本中未转义引号）
  try {
    const repaired = jsonrepair(jsonStr);
    return JSON.parse(repaired) as T;
  } catch (error) {
    logJsonParseError('Attempt 3', jsonStr, error);
  }

  // 尝试 4：剔除或转义控制字符
  try {
    let fixed = jsonStr;

    fixed = fixed.replace(/[\x00-\x1F\x7F]/g, (char) => {
      switch (char) {
        case '\n':
          return '\\n';
        case '\r':
          return '\\r';
        case '\t':
          return '\\t';
        default:
          return '';
      }
    });

    return JSON.parse(fixed) as T;
  } catch (error) {
    logJsonParseError('Attempt 4', jsonStr, error);
    return null;
  }
}