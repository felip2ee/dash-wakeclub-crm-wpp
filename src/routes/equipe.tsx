import { createFileRoute } from "@tanstack/react-router";

import { TelaEmBreve } from "@/components/shell/AppShell";
import { exigirAdmin } from "@/server/auth";

export const Route = createFileRoute("/equipe")({
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({ meta: [{ title: "Equipe — Wake Club" }] }),
  component: EquipePage,
});

function EquipePage() {
  return (
    <TelaEmBreve
      titulo="Equipe"
      subtitulo="Cadastro, distribuição, comissão e aparelhos do time"
      aviso="A nova tabela da equipe está sendo montada. Enquanto isso, use:"
      atalhos={[{ url: "/admin", texto: "Painel da equipe" }]}
    />
  );
}
