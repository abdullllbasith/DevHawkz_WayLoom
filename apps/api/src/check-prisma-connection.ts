import { getPrismaClient } from "./db.js";

const prisma = getPrismaClient();

try {
  const rows = await prisma.$queryRaw<Array<{ ok: number; db: string }>>`
    SELECT 1 AS ok, current_database() AS db
  `;
  for (const row of rows) {
    console.log(`ok=${row.ok} database=${row.db}`);
  }
} catch {
  console.error("Prisma connection failed.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
