import { BarChart3, Trophy } from "lucide-react";

import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Skeleton } from "@/components/ui/skeleton";

// Ranking da referência 03. Sem vendas (fase 4) não há ordem nem número: o time
// aparece com traços, para a estrutura já ser a final.
export function DesempenhoVendedores({
  vendedores,
}: {
  vendedores: { id: string; nome: string }[] | undefined;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="flex items-start gap-3">
        <Trophy aria-hidden className="mt-0.5 h-6 w-6 shrink-0" />
        <div>
          <h2 className="font-display text-lg font-semibold">Desempenho de vendedores</h2>
          <p className="text-sm text-muted-foreground">Ranking por valor vendido no período</p>
        </div>
      </header>
      <div className="-mx-4 mt-3 overflow-x-auto px-4">
        <table className="w-full min-w-[26rem] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="py-2 font-medium">
                #
              </th>
              <th scope="col" className="py-2 font-medium">
                Vendedor
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Vendas
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Valor vendido
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                % do total
              </th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            {!vendedores &&
              [0, 1, 2].map((i) => (
                <tr key={i}>
                  <td colSpan={5} className="py-1.5">
                    <Skeleton className="h-8" />
                  </td>
                </tr>
              ))}
            {vendedores?.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center">
                  Nenhum vendedor ativo
                </td>
              </tr>
            )}
            {vendedores?.map((v) => (
              <tr key={v.id} className="border-b border-border">
                <td className="py-2">—</td>
                <td className="py-2">
                  <span className="flex items-center gap-2 text-foreground">
                    <AvatarIniciais nome={v.nome} tamanho="sm" /> {v.nome}
                  </span>
                </td>
                <td className="py-2 text-right">—</td>
                <td className="py-2 text-right">—</td>
                <td className="py-2 text-right">—</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2} className="py-2 text-left font-semibold">
                <span className="flex items-center gap-2">
                  <BarChart3 aria-hidden className="h-4 w-4" /> Total da equipe
                </span>
              </th>
              <td colSpan={3} className="py-2 text-right text-xs text-muted-foreground">
                Ainda sem vendas pelo webhook
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
