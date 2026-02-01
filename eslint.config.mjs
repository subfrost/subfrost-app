import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Extract plugin instances from the next configs (they aren't hoisted by pnpm)
const allConfigs = [...nextVitals, ...nextTs];
const reactPlugin = allConfigs.find(c => c.plugins?.react)?.plugins.react;
const reactHooksPlugin = allConfigs.find(c => c.plugins?.["react-hooks"])?.plugins["react-hooks"];

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
    // Ignore build artifacts and external dependencies
    ".subfrost-build/**",
    ".external-build/**",
    "prod_wasms/**",
    "scripts/**",
    "e2e/**",
  ]),
  {
    plugins: {
      ...(reactPlugin ? { react: reactPlugin } : {}),
      ...(reactHooksPlugin ? { "react-hooks": reactHooksPlugin } : {}),
    },
    rules: {
      // Disable rules causing build failures - can be re-enabled incrementally
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-array-constructor": "warn",
      "react/no-unescaped-entities": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/use-memo": "warn",
      "@next/next/no-img-element": "warn",
      "prefer-const": "warn",
    },
  },
]);

export default eslintConfig;
