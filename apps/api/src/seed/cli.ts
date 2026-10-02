import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { getPrismaClient } from "../db.js";
import { assertImportDatabaseTarget } from "../import/database-target.js";
import {
  hashSeedPassword,
  sameSeedOrder,
  seedOrder,
  seedOrderDate,
  SEED_OUTLET_ID,
  SEED_VEHICLE_ID,
  seedPasswordMatches,
  seedUsers,
} from "./scenario.js";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
loadRepositoryEnv(path.join(repoRoot, ".env"));

let targetDatabase: string;
try {
  targetDatabase = assertImportDatabaseTarget(
    process.env.DATABASE_URL,
    process.env.NODE_ENV,
  ).database;
} catch (error) {
  const message = error instanceof Error ? error.message : "Seed target was refused.";
  console.log(message);
  process.exit(1);
}

const prisma = getPrismaClient();
try {
  const connected = await prisma.$queryRaw<Array<{ db: string }>>`
    SELECT current_database() AS db
  `;
  if (connected[0]?.db !== targetDatabase) {
    console.log("Database connection failed.");
    process.exit(1);
  }
  const passwordHash = await hashSeedPassword();
  const summary = await prisma.$transaction(async (transaction) => {
    let usersInserted = 0;
    let usersUnchanged = 0;
    for (const user of seedUsers) {
      const existing = await transaction.user.findUnique({
        where: { loginIdentifier: user.loginIdentifier },
      });
      if (!existing) {
        await transaction.user.create({
          data: {
            id: user.id,
            loginIdentifier: user.loginIdentifier,
            displayName: user.displayName,
            role: user.role,
            active: true,
            passwordHash,
          },
        });
        usersInserted += 1;
        continue;
      }
      const passwordMatches = await seedPasswordMatches(existing.passwordHash);
      const same =
        existing.id === user.id &&
        existing.displayName === user.displayName &&
        existing.role === user.role &&
        existing.active === true &&
        passwordMatches;
      if (!same) {
        throw new Error(
          `Seed user ${user.loginIdentifier} conflicts with an existing user. No records were written.`,
        );
      }
      usersUnchanged += 1;
    }

    const vehicle = await transaction.vehicle.findUnique({
      where: { vehicleId: SEED_VEHICLE_ID },
    });
    if (!vehicle) {
      throw new Error(`Competition vehicle ${SEED_VEHICLE_ID} is not imported.`);
    }
    const driver = seedUsers.find((user) => user.role === "DRIVER");
    if (!driver) {
      throw new Error("Seed driver is missing.");
    }
    let driverAssignment = "unchanged";
    if (vehicle.driverUserId === null) {
      await transaction.vehicle.update({
        where: { id: vehicle.id },
        data: { driverUserId: driver.id },
      });
      driverAssignment = "assigned";
    } else if (vehicle.driverUserId !== driver.id) {
      throw new Error(
        `Vehicle ${SEED_VEHICLE_ID} already has a different driver. No records were written.`,
      );
    }

    const outlet = await transaction.outlet.findUnique({
      where: { outletId: SEED_OUTLET_ID },
    });
    if (!outlet) {
      throw new Error(`Competition outlet ${SEED_OUTLET_ID} is not imported.`);
    }
    if (outlet.depot !== vehicle.depot) {
      throw new Error("Seed outlet and vehicle are not at the same depot.");
    }
    const calendar = await transaction.calendarSource.findUnique({
      where: { date: seedOrderDate() },
    });
    if (!calendar || calendar.isOperating !== 1) {
      throw new Error("Seed order date is not an operating calendar date.");
    }

    const storeManager = seedUsers.find((user) => user.role === "STORE_MANAGER");
    if (!storeManager) {
      throw new Error("Seed store manager is missing.");
    }
    const existingOrder = await transaction.order.findUnique({
      where: { deliveryId: seedOrder.deliveryId },
      include: { outlet: true, createdBy: true },
    });
    let ordersInserted = 0;
    let ordersUnchanged = 0;
    if (!existingOrder) {
      await transaction.order.create({
        data: {
          id: seedOrder.id,
          deliveryId: seedOrder.deliveryId,
          orderDate: seedOrderDate(),
          outletId: outlet.id,
          createdByUserId: storeManager.id,
          status: seedOrder.status,
          tempRequirement: seedOrder.tempRequirement,
          orderUnits: seedOrder.orderUnits,
          orderWeightKg: seedOrder.orderWeightKg,
          orderVolumeM3: seedOrder.orderVolumeM3,
          submittedAt: new Date(seedOrder.submittedAt),
        },
      });
      ordersInserted = 1;
    } else if (
      sameSeedOrder({
        deliveryId: existingOrder.deliveryId,
        orderDate: existingOrder.orderDate,
        outletSourceId: existingOrder.outlet.outletId,
        createdByLogin: existingOrder.createdBy.loginIdentifier,
        status: existingOrder.status,
        tempRequirement: existingOrder.tempRequirement,
        orderUnits: existingOrder.orderUnits,
        orderWeightKg: existingOrder.orderWeightKg.toString(),
        orderVolumeM3: existingOrder.orderVolumeM3.toString(),
        submittedAt: existingOrder.submittedAt,
      })
    ) {
      ordersUnchanged = 1;
    } else {
      throw new Error(
        `Seed order ${seedOrder.deliveryId} conflicts with an existing order. No records were written.`,
      );
    }

    return { usersInserted, usersUnchanged, driverAssignment, ordersInserted, ordersUnchanged };
  });
  console.log(`database=${targetDatabase}`);
  console.log(`users_inserted=${String(summary.usersInserted)}`);
  console.log(`users_unchanged=${String(summary.usersUnchanged)}`);
  console.log(`driver_assignment=${summary.driverAssignment}`);
  console.log(`orders_inserted=${String(summary.ordersInserted)}`);
  console.log(`orders_unchanged=${String(summary.ordersUnchanged)}`);
  console.log("planning_records=0");
  console.log("execution_records=0");
} catch (error) {
  const message = error instanceof Error ? error.message : "Seed failed before completion.";
  console.log(message);
  console.log("Seed failed before completion. No partial seed was committed.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  (globalThis as { wayloomPrisma?: unknown }).wayloomPrisma = undefined;
}

function loadRepositoryEnv(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key.length > 0 && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
