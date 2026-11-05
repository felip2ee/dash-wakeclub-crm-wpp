import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Target } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { plural } from "@/lib/formato";
import { definirMetaVendasDia, getConfiguracoes } from "@/server/configuracoes";
import { CHAVE_CONFIGURACOES } from "./PrecoHora";
import { Carregando, ErroAoCarregar, Secao } from "./Secao";

export function MetaVendas() {
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: CHAVE_CONFIGURACOES, queryFn: () => getConfiguracoes() });
  const [editando, setEditando] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: (valor: number) => definirMetaVendasDia({ data: { valor } }),
    onSuccess: ({ metaVendasDia }) => {
      toast.success(`Meta agora é ${plural(metaVendasDia, "venda por dia", "vendas por dia")}.`);
      setEditando(null);
    },
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao salvar."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CHAVE_CONFIGURACOES }),
  });

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const valor = Number(editando);
    if (!Number.isInteger(valor) || valor < 1 || valor > 1000) {
      toast.error("Informe uma meta inteira de 1 a 1000 vendas por dia.");
      return;
    }
    salvar.mutate(valor);
  }

  return (
    <Secao
      id="meta-vendas"
      icone={Target}
      titulo="Meta de vendas"
      subtitulo="Vendas por dia que a equipe deve fechar; base do bloco Vendas × meta da Visão geral."
    >
      {config.isError ? (
        <ErroAoCarregar
          texto="Não deu para carregar a meta."
          tentar={() => void config.refetch()}
        />
      ) : !config.data ? (
        <Carregando className="h-16" />
      ) : editando === null ? (
        <div className="flex items-center gap-3 rounded-xl bg-gradiente-primario p-3 text-white">
          <span className="flex-1 font-display text-2xl font-bold tabular-nums">
            {plural(config.data.metaVendasDia, "venda por dia", "vendas por dia")}
          </span>
          <button
            type="button"
            onClick={() => setEditando(String(config.data.metaVendasDia))}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border-l border-white/40 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Pencil aria-hidden className="h-4 w-4" />
            Editar
          </button>
        </div>
      ) : (
        <form onSubmit={enviar} className="flex flex-wrap items-center gap-2">
          <Input
            autoFocus
            inputMode="numeric"
            aria-label="Meta de vendas por dia"
            className="h-11 w-32"
            value={editando}
            onChange={(e) => setEditando(e.target.value)}
          />
          <Button type="submit" className="min-h-11" disabled={salvar.isPending}>
            Salvar
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setEditando(null)}
          >
            Cancelar
          </Button>
        </form>
      )}
    </Secao>
  );
}
