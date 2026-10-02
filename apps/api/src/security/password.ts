import { Algorithm, hash, verify } from "@node-rs/argon2";

/**
 * Argon2id password hashing.
 *
 * The algorithm is Argon2id because the approved security architecture requires it.
 * Memory cost 19456, time cost 2, parallelism 1, and a new random salt for each hash
 * are the defaults of @node-rs/argon2 2.2.1. This module does not set custom parameters.
 */
const algorithm = Algorithm.Argon2id;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, { algorithm });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
