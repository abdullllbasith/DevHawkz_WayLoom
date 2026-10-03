import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ExceptionStore, StoredException } from "./exception.js";

export function prismaExceptionStore(prisma: PrismaClient): ExceptionStore {
  return {
    async create(input) {
      const exception = await prisma.exception.create({
        data: {
          id: randomUUID(),
          category: input.category,
          details: input.details,
          occurredAt: input.occurredAt,
          reportedByUserId: input.reportedByUserId,
        },
      });
      return toStored(exception);
    },
  };
}

function toStored(exception: {
  id: string;
  category: string;
  details: string | null;
  occurredAt: Date;
  reportedByUserId: string | null;
}): StoredException {
  return {
    id: exception.id,
    category: exception.category,
    details: exception.details,
    occurredAt: exception.occurredAt,
    reportedByUserId: exception.reportedByUserId,
  };
}
