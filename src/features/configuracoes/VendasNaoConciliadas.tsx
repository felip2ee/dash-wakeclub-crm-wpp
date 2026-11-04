import { Link2 } from "lucide-react";

import { VendasSemDono } from "@/features/dinheiro/VendasSemDono";
import { Secao } from "./Secao";

// Vendas que o webhook não casou com lead, com "Vincular a um lead" (fase 4).
export function VendasNaoConciliadas() {
  return (
    <Secao
      id="vendas-nao-conciliadas"
      icone={Link2}
      titulo="Vendas não conciliadas"
      subtitulo="Vendas encontradas no sistema de pagamento que ainda não estão vinculadas a um lead."
    >
      <VendasSemDono />
    </Secao>
  );
}
