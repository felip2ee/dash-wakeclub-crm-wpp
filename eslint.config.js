import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import importX from "eslint-plugin-import-x";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

import quality from "./eslint-rules/index.cjs";

const testFiles = [
  "**/*{.,-}{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
  "**/{__tests__,__mocks__,fixtures,mocks}/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
];

// Camadas de apresentação: nunca tocam o banco nem o driver `pg`.
const camadasUi = ["./src/components/**/*", "./src/routes/**/*", "./src/features/**/*"];

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", ".claude/**", "node_modules/**", "graphify-out/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
            {
              name: "pg",
              message:
                "Só `src/server/db.ts` pode importar o driver `pg`. Use getPool()/getPoolRw() a partir de módulos em src/server.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "warn", // legado: 3
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Fronteira de dados: só src/server/db.ts lê DATABASE_URL.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/db.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.property.name='env'][property.name=/^(DATABASE_URL|DATABASE_URL_RW)$/]",
          message: "Só src/server/db.ts pode ler a URL do banco.",
        },
      ],
    },
  },
  {
    // db.ts é o único dono do driver `pg`; mantém a proibição de `server-only`.
    files: ["src/server/db.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "import-x": importX, "import-x-debt": importX },
    settings: {
      "import-x/resolver-next": [createTypeScriptImportResolver()],
    },
    rules: {
      // `bun:test` é módulo embutido do Bun, não existe em disco.
      "import-x/no-unresolved": ["error", { ignore: ["^bun:"] }],
      "import-x/no-duplicates": "warn", // legado: 2 em src/server.ts
      "import-x/no-restricted-paths": [
        "error",
        { zones: [{ target: camadasUi, from: "./src/server/db.ts" }] },
      ],
    },
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
    plugins: { quality },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",
      "prefer-const": "error",
      // Orçamento de tamanho/complexidade: "warn" de propósito (conversa sobre fatoração, não gate).
      complexity: ["warn", 12],
      "max-depth": ["error", 4],
      "max-statements": ["warn", 20],
      "max-params": ["error", 4],
      "max-lines-per-function": ["warn", { max: 150, skipBlankLines: true, skipComments: true }],
      "max-nested-callbacks": ["error", 3],
      "quality/max-lines": ["warn", { max: 350 }], // legado: 7 arquivos
      "quality/no-direct-console": [
        "warn", // legado: 4 chamadas
        { logger: "o helper de log do projeto" },
      ],
      "quality/no-direct-data-access": [
        "error",
        {
          modules: ["@/server/db", "~/server/db"],
          bindings: ["getPool", "getPoolRw"],
          layers: ["/src/components/", "/src/routes/", "/src/features/"],
          extensions: [".tsx"],
        },
      ],
    },
  },
  {
    files: testFiles,
    plugins: { quality },
    rules: {
      "quality/max-lines": ["warn", { max: 350, includeTests: true }],
      "max-statements": "off",
      "max-lines-per-function": "off",
      "max-nested-callbacks": "off",
      "import-x/no-restricted-paths": "off",
      "import-x-debt/no-restricted-paths": "off",
    },
  },
  {
    files: ["eslint-rules/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "readonly", require: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  eslintPluginPrettier,
  {
    // Cópias do toolkit, mantidas byte a byte: não reformatar.
    files: ["eslint-rules/**/*.cjs", "scripts/verify-quality-rules.mjs"],
    rules: { "prettier/prettier": "off" },
  },
);
