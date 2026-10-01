import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "coverage/**",
      "**/.next/**",
      "apps/api/src/generated/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["apps/web/**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    settings: {
      next: {
        rootDir: "apps/web/",
      },
    },
    ...nextPlugin.configs["core-web-vitals"],
  },
);
