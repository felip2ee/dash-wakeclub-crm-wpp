import { createFileRoute } from "@tanstack/react-router";

import { TelaEmBreve } from "@/components/shell/AppShell";
import { exigirAdmin } from "@/server/auth";

export const Route = createFileRoute("/configuracoes")({
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({ meta: [{ title: "Configurações — Wake Club" }] }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  return (
    <TelaEmBreve
      titulo="Configurações e operação"
      subtitulo="Gerencie usuários, regras de distribuição, follow-up, integrações e operações do CRM"
      aviso="Os cartões desta tela estão sendo montados. Enquanto isso, use:"
      atalhos={[
        { url: "/admin", texto: "Usuários e operação" },
        { url: "/templates", texto: "Respostas rápidas" },
        { url: "/wf02", texto: "IA e follow-ups" },
        { url: "/perfil", texto: "Tema e tamanho da interface" },
      ]}
    />
  );
}
