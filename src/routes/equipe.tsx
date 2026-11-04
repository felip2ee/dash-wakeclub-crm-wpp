import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { EquipeCard } from "@/features/configuracoes/EquipeCard";
import { Carregando, ErroAoCarregar } from "@/features/configuracoes/Secao";
import { usePainelAdmin, Usuarios } from "@/features/configuracoes/Usuarios";
import { CHAVE_PAINEL_ADMIN } from "@/features/configuracoes/peso";
import { exigirAdmin } from "@/server/auth";

export const Route = createFileRoute("/equipe")({
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({ meta: [{ title: "Equipe — Wake Club" }] }),
  component: EquipePage,
});

// Mesmo conteúdo da equipe de /admin (cadastro, ativo, peso, %, aparelhos, push de
// teste), na pele nova. /admin continua no ar.
function EquipePage() {
  const painel = usePainelAdmin();
  const queryClient = useQueryClient();
  const [processando, setProcessando] = useState<string | null>(null);

  async function executar(chave: string, acao: () => Promise<unknown>, sucesso: string) {
    setProcessando(chave);
    try {
      await acao();
      toast.success(sucesso);
      await queryClient.invalidateQueries({ queryKey: CHAVE_PAINEL_ADMIN });
      return true;
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível concluir a ação.");
      return false;
    } finally {
      setProcessando(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Equipe</h1>
        <p className="text-muted-foreground">
          Cadastro, distribuição, comissão e aparelhos do time
        </p>
      </header>

      <Usuarios />

      <section aria-labelledby="por-atendente" className="space-y-3">
        <h2 id="por-atendente" className="font-display text-lg font-semibold">
          Por atendente
        </h2>
        {painel.isError ? (
          <ErroAoCarregar
            texto="Não deu para carregar a equipe."
            tentar={() => void painel.refetch()}
          />
        ) : !painel.data ? (
          <Carregando className="h-40" />
        ) : painel.data.atendentes.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma atendente cadastrada.
          </p>
        ) : (
          painel.data.atendentes.map((atendente) => (
            <EquipeCard
              key={atendente.usuarioId}
              atendente={atendente}
              processando={processando}
              executar={executar}
            />
          ))
        )}
      </section>
    </div>
  );
}
