import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BotaoVarredura } from "@/features/aprovacao/BotaoVarredura";
import { CardAprovacao } from "@/features/aprovacao/CardAprovacao";
import { FolhaMotivos } from "@/features/aprovacao/FolhaMotivos";
import type { Decisao } from "@/features/aprovacao/motivos";
import {
  type CardAprovacao as Card,
  decidirFollowup,
  type EntradaDecisao,
  listarFilaAprovacao,
  listarVendedoresAprovacao,
} from "@/server/aprovacao";
import { exigirSessao } from "@/server/auth";

const TODOS = "todos";

export const Route = createFileRoute("/aprovar")({
  // Admin escolhe de quem é a fila; para o atendente o servidor ignora e usa a sessão.
  validateSearch: z.object({ vendedor: z.string().uuid().optional() }),
  beforeLoad: async () => ({ sessao: await exigirSessao() }),
  head: () => ({ meta: [{ title: "Para avaliar — Wake Club" }] }),
  component: AprovarPage,
});

// Só para admin: a revisão das decisões e a varredura sob demanda (spec pipeline §7, §9).
function AtalhosAdmin() {
  return (
    <div className="flex w-full flex-wrap items-start justify-between gap-3">
      <Link
        to="/revisar-decisoes"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Revisão das decisões
      </Link>
      <Link
        to="/fila-envio"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Fila de envio
      </Link>
      <BotaoVarredura />
    </div>
  );
}

type Pendente = { card: Card; decisao: Decisao; texto: string };

// "Para avaliar" (referência 01, esquerda): um follow-up por tela, rolagem vertical com
// snap. Decidir abre a folha de motivos; a decisão só sobe quando a folha fecha.
function AprovarPage() {
  const { sessao } = Route.useRouteContext();
  const { vendedor } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const clienteQuery = useQueryClient();
  const admin = sessao.papel === "admin";
  const [atual, setAtual] = useState(0);
  const [pendente, setPendente] = useState<Pendente | null>(null);

  const fila = useQuery({
    queryKey: ["aprovacao", vendedor ?? null],
    queryFn: () => listarFilaAprovacao({ data: { vendedorId: vendedor } }),
    refetchOnWindowFocus: true,
  });
  const vendedores = useQuery({
    queryKey: ["aprovacao-vendedores"],
    queryFn: () => listarVendedoresAprovacao(),
    enabled: admin,
  });

  const decisao = useMutation({
    mutationFn: ({
      card,
      decisao,
      texto,
      motivos,
      textoLivre,
    }: Pendente & {
      motivos: string[];
      textoLivre: string;
    }) => {
      const comum = {
        followupId: card.followupId,
        textoLivre: textoLivre || undefined,
      };
      const editado = texto.trim() === card.textoSugerido.trim() ? undefined : texto.trim();
      // Cast: os chips só oferecem motivos da própria decisão (validarMotivos na folha) e o
      // Zod de decidirFollowup confere de novo no servidor.
      const data = (
        decisao === "enviar"
          ? { ...comum, decisao, motivos, texto: editado }
          : { ...comum, decisao, motivos }
      ) as EntradaDecisao;
      return decidirFollowup({ data });
    },
    onSuccess: (_r, { decisao }) => {
      toast.success(decisao === "enviar" ? "Aprovado para envio." : "Follow-up descartado.");
    },
    onError: (erro) =>
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar."),
    // O card decidido sai da lista e o próximo ocupa a mesma posição do trilho.
    onSettled: () => clienteQuery.invalidateQueries({ queryKey: ["aprovacao"] }),
  });

  const cards = fila.data ?? [];
  const total = cards.length;
  const posicao = Math.min(atual, Math.max(total - 1, 0));

  return (
    <div className="mx-auto flex altura-tela-com-barra w-full max-w-3xl flex-col px-4 pt-4 md:h-[calc(100dvh-3.5rem)] md:pb-4">
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 pb-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-bold">Para avaliar</h1>
          <p className="text-muted-foreground">Leads que precisam de uma ação</p>
        </div>
        {total > 0 && (
          <span
            aria-live="polite"
            className="rounded-full bg-gradiente-primario px-3 py-1 text-sm font-semibold text-white tabular-nums"
          >
            {posicao + 1} de {total}
          </span>
        )}
        {admin && (
          <>
            <Select
              value={vendedor ?? TODOS}
              onValueChange={(v) => {
                setAtual(0);
                void navigate({ search: v === TODOS ? {} : { vendedor: v } });
              }}
            >
              <SelectTrigger aria-label="Vendedor" className="h-11 w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os vendedores</SelectItem>
                {vendedores.data?.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AtalhosAdmin />
          </>
        )}
      </header>

      {fila.isPending ? (
        <div aria-busy="true" aria-label="Carregando follow-ups" className="min-h-0 flex-1">
          <Skeleton className="mx-auto h-full w-full max-w-[480px] rounded-3xl" />
        </div>
      ) : fila.isError ? (
        <div
          role="alert"
          className="mx-auto w-full max-w-[480px] rounded-xl border border-border bg-card p-4 text-sm"
        >
          Não foi possível carregar os follow-ups.{" "}
          <button
            type="button"
            onClick={() => void fila.refetch()}
            className="min-h-11 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Tentar novamente
          </button>
        </div>
      ) : total === 0 ? (
        <p className="mx-auto w-full max-w-[480px] rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
          Nenhum follow-up esperando você
        </p>
      ) : (
        <ul
          aria-label="Follow-ups para avaliar"
          onScroll={(e) =>
            setAtual(Math.round(e.currentTarget.scrollTop / e.currentTarget.clientHeight))
          }
          className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain motion-safe:scroll-smooth"
        >
          {cards.map((card) => (
            <li key={card.followupId} className="h-full snap-start snap-always pb-3">
              <CardAprovacao
                card={card}
                admin={admin}
                ocupado={decisao.isPending || pendente !== null}
                onDecidir={(d, texto) => setPendente({ card, decisao: d, texto })}
              />
            </li>
          ))}
        </ul>
      )}

      <FolhaMotivos
        decisao={pendente?.decisao ?? null}
        onConcluir={(motivos, textoLivre) => {
          if (!pendente) return;
          decisao.mutate({ ...pendente, motivos, textoLivre });
          setPendente(null);
        }}
      />
    </div>
  );
}
