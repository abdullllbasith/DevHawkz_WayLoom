import type { PrismaClient } from "../generated/prisma/client.js";
import type { AuthUserRecord, UserDirectory } from "./auth.js";

export function prismaUserDirectory(prisma: PrismaClient): UserDirectory {
  return {
    async findByLoginIdentifier(loginIdentifier: string): Promise<AuthUserRecord | null> {
      const user = await prisma.user.findUnique({ where: { loginIdentifier } });
      return user === null ? null : toAuthUser(user);
    },
    async findById(id: string): Promise<AuthUserRecord | null> {
      const user = await prisma.user.findUnique({ where: { id } });
      return user === null ? null : toAuthUser(user);
    },
  };
}

function toAuthUser(user: {
  id: string;
  loginIdentifier: string;
  displayName: string;
  role: string;
  active: boolean;
  passwordHash: string;
}): AuthUserRecord {
  return {
    id: user.id,
    loginIdentifier: user.loginIdentifier,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    passwordHash: user.passwordHash,
  };
}
