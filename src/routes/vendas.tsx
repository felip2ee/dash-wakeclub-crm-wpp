import { createFileRoute } from "@tanstack/react-router";

import { TelaEmBreve } from "@/components/shell/AppShell";
import { exigirAdmin } from "@/server/auth";

export const Route = createFileRoute("/vendas")({
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({ meta: [{ title: "Vendas e comissões — Wake Club" }] }),
  component: VendasPage,
});

function VendasPage() {
  return (
    <TelaEmBreve
      titulo="Vendas e comissões"
      subtitulo="Vendas recebidas, conciliação e comissões do time"
      aviso="Em breve: vendas e comissões chegam com a integração de pagamento. Enquanto isso, use:"
      atalhos={[{ url: "/reports", texto: "Relatórios" }]}
    />
  );
}
