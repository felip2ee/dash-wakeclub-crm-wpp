// Perfil tipado: lento (monta um programa TypeScript), fora do gate padrão `lint`.
// Rode com `bun run lint:typed`. Promova uma regra a "error" só quando zerar.
import defaultConfig from "./eslint.config.js";

export default [
  ...defaultConfig,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
    },
  },
];
