import * as tls from "node:tls";

type SystemCaApi = {
  getCACertificates?: (type: "default" | "system") => string[];
  setDefaultCACertificates?: (certificates: readonly string[]) => void;
};

let trusted = false;

/**
 * 在 Node 自带 CA 之外追加操作系统证书库。
 * 本地 HTTPS 解密代理的根证书通常只在系统库里；不关闭 TLS 校验，失败时保持原信任库。
 */
export function trustSystemCertificates(): void {
  if (trusted) return;
  trusted = true;

  try {
    const api = tls as SystemCaApi;
    if (!api.getCACertificates || !api.setDefaultCACertificates) return;

    const defaults = api.getCACertificates("default");
    const system = api.getCACertificates("system");
    const seen = new Set(defaults);
    const merged = [...defaults];
    for (const certificate of system) {
      if (!seen.has(certificate)) merged.push(certificate);
    }
    if (merged.length === defaults.length) return;
    api.setDefaultCACertificates(merged);
  } catch (error) {
    console.warn(`[llm] system CA unavailable: ${error instanceof Error ? error.name : "unknown"}`);
  }
}
