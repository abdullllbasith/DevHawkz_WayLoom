import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(appDirectory, "..", "..");

// Use the repository .env.example / untracked .env. Do not hard-code an API URL.
loadEnvConfig(repositoryRoot);

const nextConfig: NextConfig = {
  // WayLoom agent instructions live in the repository rules, not generated files.
  agentRules: false,
};

export default nextConfig;
