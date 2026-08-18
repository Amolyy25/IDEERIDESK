import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Skills tiers (docs et exemples). Trackés parce qu'ils ont été commités
    // avant la règle du .gitignore, mais ce n'est pas notre code : leurs
    // exemples React tenaient `pnpm lint` en échec permanent.
    ".agents/**",
  ]),
]);

export default eslintConfig;
