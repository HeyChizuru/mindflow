import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** 两条链路共用：OpenAI 兼容 API Key */
export const HEADER_API_KEY = "x-mindflow-llm-api-key";
/** 两条链路共用：OpenAI 兼容根 URL */
export const HEADER_BASE_URL = "x-mindflow-llm-base-url";

/** LLM 配置不完整或 baseUrl 不允许（缺头 401，非法 Url / SSRF 400） */
export class LlmSettingsError extends Error {
  readonly statusCode: 401 | 400;

  constructor(message: string, statusCode: 401 | 400) {
    super(message);
    this.name = "LlmSettingsError";
    this.statusCode = statusCode;
  }
}

/** 读取请求头并 trim；空串视为未提供 */
export function headerValue(request: Request, name: string): string | undefined {
  const value = request.headers.get(name)?.trim();
  return value ? value : undefined;
}

/**
 * 读 Key + Base-Url，规范化后做生产 SSRF。
 * 不读模型名、不创建 client；缺头 401，非法 Url / SSRF 400。
 */
export async function resolveLlmConnection(request: Request): Promise<{
  apiKey: string;
  baseUrl: string;
}> {
  const apiKey = headerValue(request, HEADER_API_KEY);
  const rawBaseUrl = headerValue(request, HEADER_BASE_URL);

  if (!apiKey) {
    throw new LlmSettingsError("LLM apiKey is not set", 401);
  }

  if (!rawBaseUrl) {
    throw new LlmSettingsError("LLM baseUrl is not set", 401);
  }

  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(rawBaseUrl);
  } catch {
    throw new LlmSettingsError("LLM baseUrl is invalid", 400);
  }

  await assertSafeBaseUrl(baseUrl);

  return { apiKey, baseUrl };
}

/** 把 OpenAI 兼容根路径规范成带 `/v1`、无末尾斜杠 */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  const url = new URL(trimmed);
  let path = url.pathname.replace(/\/+$/, "");
  if (!path.endsWith("/v1")) {
    path = `${path}/v1`;
  }
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

/**
 * 生产环境拦截指向本机、内网或云元数据的 baseUrl。
 * 开发环境不拦，方便本地 vLLM。
 */
export async function assertSafeBaseUrl(baseUrl: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new LlmSettingsError("LLM baseUrl is invalid", 400);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new LlmSettingsError("LLM baseUrl is not allowed", 400);
  }

  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "metadata.google.internal" ||
    host === "169.254.169.254"
  ) {
    throw new LlmSettingsError("LLM baseUrl is not allowed", 400);
  }

  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true })).map((record) => record.address);

  for (const address of addresses) {
    if (isBlockedIp(address)) {
      throw new LlmSettingsError("LLM baseUrl is not allowed", 400);
    }
  }
}

/** 是否为 loopback、链路本地、私网或 IPv4 映射后的同类地址 */
function isBlockedIp(ip: string): boolean {
  const lower = ip.toLowerCase();

  if (lower.includes(":")) {
    if (lower === "::1" || lower === "::") {
      return true;
    }

    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
      return true;
    }

    if (lower.startsWith("::ffff:")) {
      return isBlockedIpv4(lower.slice("::ffff:".length));
    }

    return false;
  }

  return isBlockedIpv4(lower);
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [a, b] = parts;
  if (a === undefined || b === undefined) {
    return false;
  }

  if (a === 0 || a === 10 || a === 127) {
    return true;
  }

  if (a === 169 && b === 254) {
    return true;
  }

  if (a === 192 && b === 168) {
    return true;
  }

  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  return false;
}
