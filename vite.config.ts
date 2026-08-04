import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
      // These modules define createServerFn handlers. TanStack replaces their
      // implementations with RPC calls in the browser bundle.
      importProtection: {
        client: {
          excludeFiles: [
            "**/src/server/leads.ts",
            "**/src/server/meus-leads.ts",
            "**/src/server/conversas.ts",
            "**/src/server/wf02.ts",
            "**/src/server/relatorios.ts",
            "**/src/server/saude.ts",
            "**/src/server/auth.ts",
            "**/src/server/push.ts",
            "**/src/server/followups.ts",
          ],
        },
      },
    }),
    nitro(),
    viteReact(),
  ],
});
