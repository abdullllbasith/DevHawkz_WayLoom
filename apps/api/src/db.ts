import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

const globalForPrisma = globalThis as typeof globalThis & {
  wayloomPrisma?: PrismaClient;
};

export function getPrismaClient(): PrismaClient {
  const existing = globalForPrisma.wayloomPrisma;
  if (existing) {
    return existing;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create the Prisma client.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  globalForPrisma.wayloomPrisma = prisma;
  return prisma;
}
