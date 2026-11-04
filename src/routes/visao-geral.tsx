import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, CircleHelp, TriangleAlert, UserRound } from "lucide-react";
import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FiltroPeriodo } from "@/features/dinheiro/FiltroPeriodo";
import { mesCorrente } from "@/features/dinheiro/periodo";
import { SeletorDensidade } from "@/features/preferencias/SeletorDensidade";
import { AlertasOperacao } from "@/features/visao-geral/AlertasOperacao";
import { DesempenhoVendedores } from "@/features/visao-geral/DesempenhoVendedores";
import { Kpis } from "@/features/visao-geral/Kpis";
import { PipelinePorEtapa } from "@/features/visao-geral/PipelinePorEtapa";
import { VendasPorCategoria } from "@/features/visao-geral/VendasPorCategoria";
import { VendasRecentes } from "@/features/visao-geral/VendasRecentes";
import { listarVendedoresAprovacao } from "@/server/aprovacao";
import { exigirAdmin } from "@/server/auth";
import { getVisaoGeral } from "@/server/visao-geral";

export const Route = createFileRoute("/visao-geral")({
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({ meta: [{ title: "Visão geral — Wake Club" }] }),
  component: VisaoGeralPage,
});

// Mesmo ritmo do Pipeline: os números acompanham o CRM sem recarregar a página.
const RECARREGAR_A_CADA_MS = 30_000;
const TODOS = "todos";

const BOTAO_ICONE =
  "inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// Visão geral (referência 03): filtros, KPIs, vendas, pipeline por etapa, time e alertas.
function VisaoGeralPage() {
  const [vendedor, setVendedor] = useState(TODOS);
  const [periodo, setPeriodo] = useState(mesCorrente);
  const vendedorId = vendedor === TODOS ? undefined : vendedor;
  const visao = useQuery({
    queryKey: ["visao-geral", vendedorId, periodo],
    queryFn: () => getVisaoGeral({ data: { vendedorId, periodo } }),
    refetchInterval: RECARREGAR_A_CADA_MS,
  });
  const vendedores = useQuery({
    queryKey: ["vendedores"],
    queryFn: () => listarVendedoresAprovacao(),
  });

  return (
    <div className="space-y-5 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Visão geral</h1>
          <p className="text-muted-foreground">Panorama do seu CRM, vendas e equipe</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden text-sm font-medium lg:inline">Densidade da interface</span>
          <SeletorDensidade />
          {/* shortcut: sino e ajuda ainda sem destino; ganham ação quando houver central de avisos. */}
          <button type="button" aria-label="Notificações" title="em breve" className={BOTAO_ICONE}>
            <Bell aria-hidden className="h-5 w-5" />
          </button>
          <button type="button" aria-label="Ajuda" title="em breve" className={BOTAO_ICONE}>
            <CircleHelp aria-hidden className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
        {/* Período só recorta as vendas; o pipeline é sempre o estado atual. */}
        <FiltroPeriodo periodo={periodo} onChange={setPeriodo} />
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

      {visao.isError ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"
        >
          <TriangleAlert aria-hidden className="mx-auto h-8 w-8 text-destructive" />
          <p className="mt-2 font-semibold">Não deu para carregar a visão geral</p>
          <p className="text-sm text-muted-foreground">{visao.error.message}</p>
          <button
            type="button"
            onClick={() => void visao.refetch()}
            className="mt-3 min-h-11 rounded-full border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <>
          <Kpis totais={visao.data?.pipeline.totais} vendas={visao.data?.vendas} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="min-w-0 space-y-4 xl:col-span-2">
              <VendasPorCategoria categorias={visao.data?.vendas.porCategoria} />
              {visao.data ? (
                <PipelinePorEtapa colunas={visao.data.pipeline.colunas} />
              ) : (
                <Skeleton className="h-48 rounded-xl" />
              )}
            </div>
            <div className="min-w-0">
              <DesempenhoVendedores ranking={visao.data?.vendas.rankingPeriodo} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="min-w-0">
              <VendasRecentes vendas={visao.data?.vendas.vendasRecentes} />
            </div>
            <div className="min-w-0">
              <AlertasOperacao
                alertas={visao.data?.alertas}
                comissao={visao.data?.vendas.comissaoAPagarDia10}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
