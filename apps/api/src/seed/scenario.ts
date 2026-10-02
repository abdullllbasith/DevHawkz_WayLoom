import { hash, verify, Algorithm } from "@node-rs/argon2";

export const SEED_PASSWORD = "wayloom-dev-only";
export const SEED_PASSWORD_SALT = Buffer.from("wayloomseed00001");
export const SEED_OUTLET_ID = "OUT001";
export const SEED_VEHICLE_ID = "VEH001";
export const SEED_ORDER_DATE = "2026-06-02";
export const SEED_DELIVERY_ID = "SEED-2026-06-02-OUT001";
export const SEED_SUBMITTED_AT = "2026-06-01T08:00:00.000Z";

const hashOptions = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  salt: SEED_PASSWORD_SALT,
};

export const seedUsers = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    loginIdentifier: "seed.dispatcher",
    displayName: "Seed Dispatcher",
    role: "DISPATCHER",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    loginIdentifier: "seed.loader",
    displayName: "Seed Loader",
    role: "LOADER",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    loginIdentifier: "seed.driver",
    displayName: "Seed Driver",
    role: "DRIVER",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    loginIdentifier: "seed.store-manager",
    displayName: "Seed Store Manager",
    role: "STORE_MANAGER",
  },
] as const;

export const seedOrder = {
  id: "55555555-5555-4555-8555-555555555555",
  deliveryId: SEED_DELIVERY_ID,
  orderDate: SEED_ORDER_DATE,
  outletSourceId: SEED_OUTLET_ID,
  status: "SUBMITTED",
  tempRequirement: "chilled",
  orderUnits: 10,
  orderWeightKg: "50",
  orderVolumeM3: "1.5",
  submittedAt: SEED_SUBMITTED_AT,
} as const;

export function seedOrderDate(): Date {
  const [year, month, day] = SEED_ORDER_DATE.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

export function hashSeedPassword(): Promise<string> {
  return hash(SEED_PASSWORD, hashOptions);
}

export function seedPasswordMatches(passwordHash: string): Promise<boolean> {
  return verify(passwordHash, SEED_PASSWORD);
}

export function sameSeedOrder(existing: {
  deliveryId: string;
  orderDate: Date;
  outletSourceId: string;
  createdByLogin: string;
  status: string;
  tempRequirement: string;
  orderUnits: number;
  orderWeightKg: string;
  orderVolumeM3: string;
  submittedAt: Date | null;
}): boolean {
  return (
    existing.deliveryId === seedOrder.deliveryId &&
    existing.orderDate.toISOString().slice(0, 10) === seedOrder.orderDate &&
    existing.outletSourceId === seedOrder.outletSourceId &&
    existing.createdByLogin === "seed.store-manager" &&
    existing.status === seedOrder.status &&
    existing.tempRequirement === seedOrder.tempRequirement &&
    existing.orderUnits === seedOrder.orderUnits &&
    existing.orderWeightKg === seedOrder.orderWeightKg &&
    existing.orderVolumeM3 === seedOrder.orderVolumeM3 &&
    existing.submittedAt?.toISOString() === seedOrder.submittedAt
  );
}
