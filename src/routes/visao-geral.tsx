import { createFileRoute } from "@tanstack/react-router";

import { TelaEmBreve } from "@/components/shell/AppShell";
import { exigirAdmin } from "@/server/auth";

export const Route = createFileRoute("/visao-geral")({
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({ meta: [{ title: "Visão geral — Wake Club" }] }),
  component: VisaoGeralPage,
});

function VisaoGeralPage() {
  return (
    <TelaEmBreve
      titulo="Visão geral"
      subtitulo="Performance do time, pipeline e vendas"
      aviso="Os indicadores desta tela estão sendo montados. Enquanto isso, use:"
      atalhos={[
        { url: "/admin", texto: "Painel da equipe" },
        { url: "/reports", texto: "Relatórios" },
      ]}
    />
  );
}
