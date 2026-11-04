import { Link2 } from "lucide-react";

import { dinheiroDisponivel } from "@/features/dinheiro/disponivel";
import { Secao } from "./Secao";

// Fase 4: a tabela com "Vincular a um lead" entra quando as vendas chegarem pelo webhook.
export function VendasNaoConciliadas() {
  return (
    <Secao
      id="vendas-nao-conciliadas"
      icone={Link2}
      titulo="Vendas não conciliadas"
      subtitulo="Vendas encontradas no sistema de pagamento que ainda não estão vinculadas a um lead."
    >
      {!dinheiroDisponivel && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma venda recebida ainda.
        </p>
      )}
    </Secao>
  );
}
