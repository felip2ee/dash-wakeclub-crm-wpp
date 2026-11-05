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
import { FiltroPeriodo } from "@/features/dinheiro/FiltroPeriodo";
import { mesCorrente } from "@/features/dinheiro/periodo";
import { SeletorDensidade } from "@/features/preferencias/SeletorDensidade";
import { AlertasOperacao } from "@/features/visao-geral/AlertasOperacao";
import { Atendimento } from "@/features/visao-geral/Atendimento";
import { DesempenhoVendedores } from "@/features/visao-geral/DesempenhoVendedores";
import { KpisComerciais } from "@/features/visao-geral/KpisComerciais";
import { PorOrigem } from "@/features/visao-geral/PorOrigem";
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
  "inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

// Visão geral comercial: filtros, vendas × meta, origem, atendimento, time e alertas.
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
          <p className="text-muted-foreground">
            O comercial está indo bem? Vendas contra a meta, leads novos, origem e conversão
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden text-sm font-medium lg:inline">Densidade da interface</span>
          <SeletorDensidade />
          {/* shortcut: sino e ajuda ainda sem destino (aria-disabled); ganham ação quando houver central de avisos. */}
          <button
            type="button"
            aria-label="Notificações"
            aria-disabled="true"
            title="em breve"
            className={BOTAO_ICONE}
          >
            <Bell aria-hidden className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Ajuda"
            aria-disabled="true"
            title="em breve"
            className={BOTAO_ICONE}
          >
            <CircleHelp aria-hidden className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
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
          <KpisComerciais comercial={visao.data?.comercial} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">
              <PorOrigem comercial={visao.data?.comercial} />
            </div>
            <div className="min-w-0">
              <Atendimento comercial={visao.data?.comercial} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="min-w-0">
              <DesempenhoVendedores ranking={visao.data?.vendas.rankingPeriodo} />
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
