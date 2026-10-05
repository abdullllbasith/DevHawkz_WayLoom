import { prismaAiAudit } from "./ai/audit-store.js";
import { coreRoutes } from "./api/core-routes.js";
import { prismaCore } from "./api/prisma-core.js";
import { createApp } from "./app.js";
import type { ApiConfig } from "./config.js";
import { getPrismaClient } from "./db.js";
import { createLogger } from "./log.js";
import { probeDatabase } from "./readiness.js";
import { prismaSecurityAudit } from "./security/audit-store.js";
import { createLoginRateLimiter } from "./security/login-rate-limit.js";
import { prismaSessionStore } from "./security/session-store.js";
import { prismaUserDirectory } from "./security/user-directory.js";
import { assignedOutletIds } from "./security/user-outlet-store.js";

export function createApiListener(config: ApiConfig) {
  const log = createLogger(config.logLevel);
  const prisma = getPrismaClient();
  return createApp({
    nodeEnv: config.nodeEnv,
    log,
    users: prismaUserDirectory(prisma),
    sessions: prismaSessionStore(prisma),
    assignedOutletIds: (userId) => assignedOutletIds(prisma, userId),
    loginRateLimit: createLoginRateLimiter(config.loginRateLimit),
    httpSecurity: config.httpSecurity,
    audit: prismaSecurityAudit(prisma),
    readiness: () => probeDatabase(() => prisma.$queryRaw`SELECT 1`),
    businessRoutes: coreRoutes({
      ...prismaCore(prisma),
      now: () => new Date(),
      aiEnv: process.env,
      aiAudit: prismaAiAudit(prisma),
    }),
  });
}
