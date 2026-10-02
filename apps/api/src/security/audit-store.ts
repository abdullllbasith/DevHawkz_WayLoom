import type { PrismaClient } from "../generated/prisma/client.js";
import type { SecurityAuditRecord, SecurityAuditWriter } from "./audit.js";

export function prismaSecurityAudit(prisma: PrismaClient): SecurityAuditWriter {
  return {
    async record(event: SecurityAuditRecord): Promise<void> {
      await prisma.auditEvent.create({
        data: {
          action: event.action,
          occurredAt: event.occurredAt,
          actorUserId: event.actorUserId,
          details: event.details,
        },
      });
    },
  };
}
