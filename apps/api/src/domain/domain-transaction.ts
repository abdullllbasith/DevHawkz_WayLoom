import { Prisma } from "../generated/prisma/client.js";

export const domainTransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

export function persistenceCode(error: unknown): "concurrency_conflict" | "persistence_failure" {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
    return "concurrency_conflict";
  }
  return "persistence_failure";
}
