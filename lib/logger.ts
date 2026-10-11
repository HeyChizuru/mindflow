/**
 * 轻量日志标签，不向客户端输出。
 */
export function createLogger(scope: string) {
  const prefix = `[${scope}]`;
  return {
    info: (message: string, ...args: unknown[]) => console.info(prefix, message, ...args),
    warn: (message: string, ...args: unknown[]) => console.warn(prefix, message, ...args),
    error: (message: string, ...args: unknown[]) => console.error(prefix, message, ...args),
  };
}
