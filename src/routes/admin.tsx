import { createFileRoute, redirect } from "@tanstack/react-router";

import { exigirAdmin } from "@/server/auth";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    await exigirAdmin();
    throw redirect({ to: "/" });
  },
});
