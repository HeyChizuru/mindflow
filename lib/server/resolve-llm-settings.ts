import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { normalizeBaseUrl } from "@/lib/ai/openai-compat";
import type { LlmSettings, ResolvedLlmSettings } from "@/lib/ai/types";

/** LLM 配置不完整或 baseUrl 不允许（缺 key、生产 SSRF 等） */
export class LlmSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmSettingsError";
  }
}

/**
 * 合并请求体 llm 与服务端 env，得到调用模型前的完整配置。
 * 优先级：partial → LLM_* → DEEPSEEK_* / OPENAI_*；缺 apiKey 或 baseUrl 抛错。
 * 生产环境拒绝内网 / localhost / 元数据地址。不打印完整 key。
 */
export async function resolveLlmSettings(
  partial?: LlmSettings,
): Promise<ResolvedLlmSettings> {
  const apiKey = firstNonEmpty(
    partial?.apiKey,
    process.env.LLM_API_KEY,
    process.env.DEEPSEEK_API_KEY,
    process.env.OPENAI_API_KEY,
  );
  const rawBaseUrl = firstNonEmpty(
    partial?.baseUrl,
    process.env.LLM_BASE_URL,
    process.env.DEEPSEEK_BASE_URL,
    process.env.OPENAI_BASE_URL,
  );
  const chatModel =
    firstNonEmpty(
      partial?.chatModel,
      process.env.LLM_MODEL,
      process.env.DEEPSEEK_MODEL,
    ) ?? "deepseek-chat";
  const embeddingModel =
    firstNonEmpty(partial?.embeddingModel, process.env.EMBEDDING_MODEL) ??
    "BAAI/bge-m3";

  if (!apiKey) {
    throw new LlmSettingsError("LLM apiKey is not set");
  }

  if (!rawBaseUrl) {
    throw new LlmSettingsError("LLM baseUrl is not set");
  }

  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(rawBaseUrl);
  } catch {
    throw new LlmSettingsError("LLM baseUrl is invalid");
  }

  await assertSafeBaseUrl(baseUrl);

  return {
    apiKey,
    baseUrl,
    chatModel,
    embeddingModel,
  };
}

/** 空白视为未提供，以便回落到 env */
function firstNonEmpty(
  ...values: Array<string | undefined>
): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
}

/**
 * 生产环境拦截指向本机、内网或云元数据的 baseUrl。
 * 开发环境不拦，方便本地 vLLM。
 */
async function assertSafeBaseUrl(baseUrl: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new LlmSettingsError("LLM baseUrl is invalid");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new LlmSettingsError("LLM baseUrl is not allowed");
  }

  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "metadata.google.internal" ||
    host === "169.254.169.254"
  ) {
    throw new LlmSettingsError("LLM baseUrl is not allowed");
  }

  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true })).map((record) => record.address);

  for (const address of addresses) {
    if (isBlockedIp(address)) {
      throw new LlmSettingsError("LLM baseUrl is not allowed");
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
