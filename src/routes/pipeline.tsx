import { createFileRoute } from "@tanstack/react-router";

import { TelaEmBreve } from "@/components/shell/AppShell";
import { exigirAdmin } from "@/server/auth";

export const Route = createFileRoute("/pipeline")({
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({ meta: [{ title: "Pipeline — Wake Club" }] }),
  component: PipelinePage,
});

function PipelinePage() {
  return (
    <TelaEmBreve
      titulo="Pipeline"
      subtitulo="Funil de vendas e oportunidades"
      aviso="As colunas com valor cheio e esperado estão sendo montadas. Enquanto isso, use:"
      atalhos={[{ url: "/kanban", texto: "Todos os leads" }]}
    />
  );
}
