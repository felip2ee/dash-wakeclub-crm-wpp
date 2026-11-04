import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronDown,
  Coins,
  Flame,
  ShoppingCart,
  Target,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useState } from "react";

import { CardDegrade } from "@/components/ui/card-degrade";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { dinheiroDisponivel } from "@/features/dinheiro/disponivel";
import { ColunaEtapa } from "@/features/pipeline/ColunaEtapa";
import { FaixaSomenteLeitura } from "@/features/pipeline/FaixaSomenteLeitura";
import { moeda, plural } from "@/lib/formato";
import { listarVendedoresAprovacao } from "@/server/aprovacao";
import { exigirAdmin } from "@/server/auth";
import { getPipeline } from "@/server/leads";

export const Route = createFileRoute("/pipeline")({
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({ meta: [{ title: "Pipeline — Wake Club" }] }),
  component: PipelinePage,
});

// Espelho do CRM: sem recarregar, a tela congela no primeiro estado (igual ao kanban).
const RECARREGAR_A_CADA_MS = 30_000;
const TODOS = "todos";

// Pipeline (referência 04): KPIs, faixa somente leitura e colunas por etapa.
function PipelinePage() {
  const [vendedor, setVendedor] = useState(TODOS);
  const vendedorId = vendedor === TODOS ? undefined : vendedor;
  const pipeline = useQuery({
    queryKey: ["pipeline", vendedorId],
    queryFn: () => getPipeline({ data: { vendedorId } }),
    refetchInterval: RECARREGAR_A_CADA_MS,
  });
  const vendedores = useQuery({
    queryKey: ["vendedores"],
    queryFn: () => listarVendedoresAprovacao(),
  });
  const totais = pipeline.data?.totais;

  return (
    <div className="space-y-5 px-4 py-6 md:px-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Pipeline</h1>
        <p className="text-muted-foreground">
          Acompanhe os leads por etapa, valores e previsão de vendas
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        {/* Período só vale para vendas (fase 4); o pipeline é sempre o estado atual. */}
        <button
          type="button"
          disabled
          title="O período vale para as vendas, que chegam na fase 4"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm disabled:cursor-not-allowed disabled:opacity-70"
        >
          <CalendarDays aria-hidden className="h-4 w-4" />
          <span className="font-semibold">Período:</span> estado atual
          <ChevronDown aria-hidden className="h-4 w-4" />
        </button>
        <Select value={vendedor} onValueChange={setVendedor}>
          <SelectTrigger
            aria-label="Vendedor"
            className="min-h-11 w-auto gap-2 rounded-xl bg-card px-4"
          >
            <UserRound aria-hidden className="h-4 w-4" />
            <span className="font-semibold">Vendedor:</span>
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
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {totais ? (
          <>
            <CardDegrade
              titulo="Pipeline cheio"
              valor={moeda(totais.valorCheio)}
              legenda={plural(totais.leadsAtivos, "lead ativo", "leads ativos")}
              icone={Flame}
              info="Soma de horas estimadas × preço da hora dos leads que ainda podem fechar."
            />
            <CardDegrade
              titulo="Estimativa realista"
              valor={moeda(totais.valorEsperado)}
              legenda={`${totais.probabilidade}% de probabilidade`}
              icone={Target}
              info="Valor cheio × chance de fechar por etapa e temperatura."
            />
          </>
        ) : (
          <>
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </>
        )}
        {!dinheiroDisponivel && (
          <>
            <CardDegrade
              titulo="Vendido"
              valor="Em breve"
              legenda="Aparece quando as vendas chegarem ao CRM"
              icone={ShoppingCart}
            />
            <CardDegrade
              titulo="Comissão a pagar"
              valor="Em breve"
              legenda="Calculada sobre as vendas recebidas"
              icone={Coins}
            />
          </>
        )}
      </div>

      <FaixaSomenteLeitura />

      {pipeline.isError ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"
        >
          <TriangleAlert aria-hidden className="mx-auto h-8 w-8 text-destructive" />
          <p className="mt-2 font-semibold">Não deu para carregar o pipeline</p>
          <button
            type="button"
            onClick={() => void pipeline.refetch()}
            className="mt-3 min-h-11 rounded-full border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Tentar de novo
          </button>
        </div>
      ) : !pipeline.data ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-96 w-[85vw] max-w-[300px] shrink-0 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {pipeline.data.colunas.every((c) => c.quantidade === 0) && (
            <p className="text-center text-sm text-muted-foreground">
              Nenhum lead {vendedorId ? "deste vendedor" : "no CRM"} ainda.
            </p>
          )}
          {/* Celular: uma coluna por vez, com encaixe na rolagem horizontal. */}
          <div className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-3 md:-mx-6 md:px-6">
            {pipeline.data.colunas.map((coluna) => (
              <ColunaEtapa key={coluna.etapa} coluna={coluna} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
