import type { PrismaClient } from "../generated/prisma/client.js";
import type { SessionRecord, SessionStore } from "./session.js";

export function prismaSessionStore(prisma: PrismaClient): SessionStore {
  return {
    async create(record: SessionRecord): Promise<void> {
      await prisma.session.create({
        data: {
          id: record.id,
          userId: record.userId,
          sessionTokenHash: record.sessionTokenHash,
          expiresAt: record.expiresAt,
          createdAt: record.createdAt,
          revokedAt: record.revokedAt,
          lastSeenAt: record.lastSeenAt,
        },
      });
    },
    async findByTokenHash(sessionTokenHash: string): Promise<SessionRecord | null> {
      const found = await prisma.session.findUnique({ where: { sessionTokenHash } });
      if (!found) {
        return null;
      }
      return {
        id: found.id,
        userId: found.userId,
        sessionTokenHash: found.sessionTokenHash,
        expiresAt: found.expiresAt,
        createdAt: found.createdAt,
        revokedAt: found.revokedAt,
        lastSeenAt: found.lastSeenAt,
      };
    },
    async revoke(sessionId: string, revokedAt: Date): Promise<void> {
      await prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt },
      });
    },
    async touchLastSeen(sessionId: string, lastSeenAt: Date): Promise<void> {
      await prisma.session.update({
        where: { id: sessionId },
        data: { lastSeenAt },
      });
    },
  };
}
