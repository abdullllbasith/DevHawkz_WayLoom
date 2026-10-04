import { createServer } from "node:http";
import { coreRoutes } from "./api/core-routes.js";
import { prismaCore } from "./api/prisma-core.js";
import { createApp } from "./app.js";
import { loadConfig, type ApiConfig } from "./config.js";
import { getPrismaClient } from "./db.js";
import { createLogger, redactSecrets } from "./log.js";
import { probeDatabase } from "./readiness.js";
import { prismaSecurityAudit } from "./security/audit-store.js";
import { createLoginRateLimiter } from "./security/login-rate-limit.js";
import { prismaSessionStore } from "./security/session-store.js";
import { prismaUserDirectory } from "./security/user-directory.js";
import { assignedOutletIds } from "./security/user-outlet-store.js";

try {
  start(loadConfig());
} catch (error) {
  const message =
    error instanceof Error ? error.message : "API failed to start.";
  console.error(redactSecrets(message));
  process.exit(1);
}

function start(config: ApiConfig): void {
  const log = createLogger(config.logLevel);
  const prisma = getPrismaClient();
  const server = createServer(
    createApp({
      nodeEnv: config.nodeEnv,
      log,
      users: prismaUserDirectory(prisma),
      sessions: prismaSessionStore(prisma),
      assignedOutletIds: (userId) => assignedOutletIds(prisma, userId),
      loginRateLimit: createLoginRateLimiter(config.loginRateLimit),
      httpSecurity: config.httpSecurity,
      audit: prismaSecurityAudit(prisma),
      readiness: () => probeDatabase(() => prisma.$queryRaw`SELECT 1`),
      businessRoutes: coreRoutes({ ...prismaCore(prisma), now: () => new Date() }),
    }),
  );
  let closing = false;

  server.on("error", (error: NodeJS.ErrnoException) => {
    log.error(
      `API failed to bind ${config.host}:${config.port}. ${error.code ?? "listen_error"}`,
    );
    process.exit(1);
  });

  const shutdown = (signal: NodeJS.Signals) => {
    if (closing) {
      return;
    }
    closing = true;
    log.info(`Received ${signal}. Closing API server.`);
    server.close((error) => {
      if (error) {
        log.error("API server failed to close.");
        process.exit(1);
      }
      process.exit(0);
    });
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });

  server.listen(config.port, config.host, () => {
    log.info(`API listening on http://${config.host}:${config.port}`);
  });
}
