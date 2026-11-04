import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Link2, Receipt, UserRound, Wallet } from "lucide-react";
import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Secao } from "@/features/configuracoes/Secao";
import { FechamentoMes } from "@/features/dinheiro/FechamentoMes";
import { FiltroPeriodo } from "@/features/dinheiro/FiltroPeriodo";
import { ListaVendas } from "@/features/dinheiro/ListaVendas";
import { mesCorrente } from "@/features/dinheiro/periodo";
import { VendasSemDono } from "@/features/dinheiro/VendasSemDono";
import { listarVendedoresAprovacao } from "@/server/aprovacao";
import { exigirAdmin } from "@/server/auth";

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
  const filtro = { ...periodo, vendedorId: vendedor === TODOS ? undefined : vendedor };

  return (
    <div className="space-y-5 px-4 py-6 md:px-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Vendas e comissões</h1>
        <p className="text-muted-foreground">Vendas recebidas, conciliação e comissões do time</p>
      </header>

      <Secao
        id="lista"
        icone={Receipt}
        titulo="Vendas"
        subtitulo="Pagas e estornadas no período; estorne à mão o que o pagamento não avisou."
      >
        <div className="mb-3 flex flex-wrap gap-3">
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
