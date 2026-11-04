import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Tag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { moeda } from "@/lib/formato";
import { definirPrecoHora, getConfiguracoes } from "@/server/configuracoes";
import { Carregando, ErroAoCarregar, Secao } from "./Secao";

export const CHAVE_CONFIGURACOES = ["configuracoes"];

// Na referência 02 este cartão é "Comissão"; no WakeCRM é o preço da hora, base do valor esperado.
export function PrecoHora() {
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: CHAVE_CONFIGURACOES, queryFn: () => getConfiguracoes() });
  const [editando, setEditando] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: (valor: number) => definirPrecoHora({ data: { valor } }),
    onSuccess: ({ precoHora }) => {
      toast.success(`Preço da hora agora é ${moeda(precoHora)}.`);
      setEditando(null);
    },
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao salvar."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CHAVE_CONFIGURACOES }),
  });

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const valor = Number((editando ?? "").replace(",", "."));
    if (!(valor > 0)) {
      toast.error("O preço da hora precisa ser maior que zero.");
      return;
    }
    salvar.mutate(valor);
  }

  return (
    <Secao
      id="preco-hora"
      icone={Tag}
      titulo="Preço da hora"
      subtitulo="Valor de uma hora de aula, base do valor esperado dos leads."
    >
      {config.isError ? (
        <ErroAoCarregar
          texto="Não deu para carregar o preço."
          tentar={() => void config.refetch()}
        />
      ) : !config.data ? (
        <Carregando className="h-16" />
      ) : editando === null ? (
        <div className="flex items-center gap-3 rounded-xl bg-gradiente-primario p-3 text-white">
          <span className="flex-1 font-display text-2xl font-bold tabular-nums">
            {moeda(config.data.precoHora)}
          </span>
          <button
            type="button"
            onClick={() => setEditando(String(config.data.precoHora).replace(".", ","))}
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
            inputMode="decimal"
            aria-label="Preço da hora em reais"
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
