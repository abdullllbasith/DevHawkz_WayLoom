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

export type StructuredLog = {
  timestamp: string;
  service: "api";
  severity: "error" | "info";
  event: string;
  message?: string;
  correlationId?: string;
};

export function formatLogLine(event: StructuredLog): string {
  return JSON.stringify({
    ...event,
    ...(event.message === undefined ? {} : { message: redactLogText(event.message) }),
    ...(event.correlationId === undefined ? {} : { correlationId: event.correlationId }),
  });
}

export function createLogger(level: LogLevel): Logger {
  return {
    error(message: string) {
      write(level, "error", "api.error", message);
    },
    info(message: string) {
      write(level, "info", "api.info", message);
    },
  };
}

function write(level: LogLevel, severity: "error" | "info", event: string, message: string): void {
  if (rank[level] < rank[severity]) {
    return;
  }
  try {
    const line = formatLogLine({
      timestamp: new Date().toISOString(),
      service: "api",
      severity,
      event,
      message,
    });
    if (severity === "error") {
      console.error(line);
      return;
    }
    console.info(line);
  } catch {
    return;
  }
}

export function redactSecrets(message: string): string {
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]");
}

function redactLogText(message: string): string {
  return redactSecrets(message).replace(
    /(password|token|cookie|authorization|api[_-]?key)=([^\s&]+)/gi,
    "$1=[redacted]",
  );
}
