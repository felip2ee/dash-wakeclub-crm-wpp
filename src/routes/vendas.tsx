import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Coins, Link2, Receipt, ShoppingCart, UserRound, Wallet } from "lucide-react";
import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardDegrade } from "@/components/ui/card-degrade";
import { Skeleton } from "@/components/ui/skeleton";
import { Secao } from "@/features/configuracoes/Secao";
import { FechamentoMes } from "@/features/dinheiro/FechamentoMes";
import { FiltroPeriodo } from "@/features/dinheiro/FiltroPeriodo";
import { ListaVendas } from "@/features/dinheiro/ListaVendas";
import { mesCorrente, rotuloMes } from "@/features/dinheiro/periodo";
import { VendasSemDono } from "@/features/dinheiro/VendasSemDono";
import { VendasPorCategoria } from "@/features/visao-geral/VendasPorCategoria";
import { moeda, plural } from "@/lib/formato";
import { listarVendedoresAprovacao } from "@/server/aprovacao";
import { exigirAdmin } from "@/server/auth";
import { getResumoDinheiro } from "@/server/dinheiro";

export const Route = createFileRoute("/vendas")({
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({ meta: [{ title: "Vendas e comissões — Wake Club" }] }),
  component: VendasPage,
});

const TODOS = "todos";

// Vendas e comissões (admin, spec fase 4 §7): lista com filtros, vendas sem dono e o
// fechamento do mês com "Marcar pago".
function VendasPage() {
  const [periodo, setPeriodo] = useState(mesCorrente);
  const [vendedor, setVendedor] = useState(TODOS);
  const vendedores = useQuery({
    queryKey: ["vendedores"],
    queryFn: () => listarVendedoresAprovacao(),
  });
  const vendedorId = vendedor === TODOS ? undefined : vendedor;
  const filtro = { ...periodo, vendedorId };
  const resumo = useQuery({
    queryKey: ["vendas", "resumo", filtro],
    queryFn: () => getResumoDinheiro({ data: { periodo, vendedorId } }),
  });
  const vendas = resumo.data;

  return (
    <div className="space-y-5 px-4 py-6 md:px-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Vendas e comissões</h1>
        <p className="text-muted-foreground">Vendas recebidas, conciliação e comissões do time</p>
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

      <Secao
        id="resumo"
        icone={BarChart3}
        titulo="Resumo do período"
        subtitulo="Vendido, comissão a pagar e vendas por categoria no período escolhido."
      >
        <div className="space-y-3">
          {resumo.isError && (
            <p role="alert" className="text-sm text-destructive">
              Não deu para carregar o resumo do período.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {vendas ? (
              <>
                <CardDegrade
                  titulo="Vendido no período"
                  valor={moeda(vendas.vendidoPeriodo.valor)}
                  legenda={`${plural(vendas.vendidoPeriodo.quantidade, "venda", "vendas")} · App ${moeda(vendas.vendidoPeriodo.valorApp)} · Direta ${moeda(vendas.vendidoPeriodo.valorDireta)}`}
                  icone={ShoppingCart}
                  info="Vendas pagas no período escolhido; estornadas não contam."
                />
                <CardDegrade
                  titulo="Comissão a pagar dia 10"
                  valor={moeda(vendas.comissaoAPagarDia10.valor)}
                  legenda={`Referente a ${rotuloMes(vendas.comissaoAPagarDia10.mes)}`}
                  icone={Coins}
                  info="Comissão do mês anterior ainda não marcada como paga em Vendas e comissões."
                />
              </>
            ) : (
              <>
                <Skeleton className="h-28 rounded-xl" />
                <Skeleton className="h-28 rounded-xl" />
              </>
            )}
          </div>
          <VendasPorCategoria categorias={vendas?.porCategoria} />
        </div>
      </Secao>

      <Secao
        id="lista"
        icone={Receipt}
        titulo="Vendas"
        subtitulo="Pagas e estornadas no período; estorne à mão o que o pagamento não avisou."
      >
        <ListaVendas filtro={filtro} />
      </Secao>

      <Secao
        id="sem-dono"
        icone={Link2}
        titulo="Vendas sem dono"
        subtitulo="Vendas que não casaram com nenhum lead pelo CPF ou telefone."
      >
        <VendasSemDono />
      </Secao>

      <Secao
        id="fechamento"
        icone={Wallet}
        titulo="Fechamento do mês"
        subtitulo="Comissão por vendedor, paga no dia 10 do mês seguinte."
      >
        <FechamentoMes />
      </Secao>
    </div>
  );
}
