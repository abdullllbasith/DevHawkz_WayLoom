import type { LogLevel } from "./config.js";

const rank: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export type Logger = {
  error(message: string): void;
  info(message: string): void;
};

export function createLogger(level: LogLevel): Logger {
  return {
    error(message: string) {
      if (rank[level] >= rank.error) {
        console.error(redactSecrets(message));
      }
    },
    info(message: string) {
      if (rank[level] >= rank.info) {
        console.info(redactSecrets(message));
      }
    },
  };
}

export function redactSecrets(message: string): string {
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]");
}
