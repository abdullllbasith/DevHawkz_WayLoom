import type { PrismaClient } from "../generated/prisma/client.js";

export async function assignedOutletIds(prisma: PrismaClient, userId: string): Promise<string[]> {
  const rows = await prisma.userOutlet.findMany({
    where: { userId },
    select: { outletId: true },
  });
  return rows.map((row) => row.outletId);
}
