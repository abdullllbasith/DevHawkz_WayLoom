import type { PrismaClient } from "../generated/prisma/client.js";
import { aiAuditDetails, type AiAuditWriter } from "./audit.js";

export function prismaAiAudit(prisma: PrismaClient): AiAuditWriter {
  return {
    async append(record) {
      const details = aiAuditDetails(record);
      await prisma.auditEvent.create({
        data: {
          action: details.action,
          occurredAt: details.occurredAt,
          actorUserId: details.actorUserId,
          details: details.details,
        },
      });
    },
  };
}
