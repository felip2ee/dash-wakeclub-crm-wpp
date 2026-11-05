import { Coins, Filter, Target, Users } from "lucide-react";

import { moeda } from "@/lib/formato";
import type { ColunaPipeline } from "@/lib/pipeline";

type Coluna = Omit<ColunaPipeline<unknown>, "cards">;

// A seta de cada etapa do funil; a primeira não tem o recorte de entrada.
const SETA =
  "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)";
const SETA_INICIAL = "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)";

// Funil horizontal da referência 03 nas etapas do CRM. "Encerrado" fica de
// fora: é saída do funil, não etapa (lista do docs/ref/README.md).
export function PipelinePorEtapa({ colunas }: { colunas: Coluna[] }) {
  const etapas = colunas.filter((c) => c.etapa !== "Encerrado");
  const linhas = [
    { rotulo: "Leads", icone: Users, valor: (c: Coluna) => String(c.quantidade) },
    { rotulo: "Valor total (pipeline)", icone: Coins, valor: (c: Coluna) => moeda(c.valorCheio) },
    { rotulo: "Valor esperado", icone: Target, valor: (c: Coluna) => moeda(c.valorEsperado) },
  ];

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="flex items-start gap-3">
        <Filter aria-hidden className="mt-0.5 h-6 w-6 shrink-0" />
        <div>
          <h2 className="font-display text-lg font-semibold">Pipeline por etapa</h2>
          <p className="text-sm text-muted-foreground">
            Visão compacta do funil com quantidade de leads, valor total do pipeline e valor
            esperado
          </p>
        </div>
      </header>
      {etapas.every((c) => c.quantidade === 0) && (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum lead no funil ainda.</p>
      )}
      {/* Celular: a tabela rola na horizontal em vez de espremer as sete etapas. */}
      <div className="-mx-4 mt-4 overflow-x-auto px-4">
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-44">
                <span className="sr-only">Indicador</span>
              </th>
              {etapas.map((c, i) => (
                <th
                  key={c.etapa}
                  scope="col"
                  style={{ clipPath: i === 0 ? SETA_INICIAL : SETA }}
                  className="bg-gradiente-primario px-4 py-2 text-xs font-semibold text-white"
                >
                  {c.etapa}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ rotulo, icone: Icone, valor }) => (
              <tr key={rotulo} className="border-b border-border last:border-0">
                <th scope="row" className="py-2 pr-3 text-left font-medium">
                  <span className="flex items-center gap-2">
                    <Icone aria-hidden className="h-4 w-4 text-muted-foreground" /> {rotulo}
                  </span>
                </th>
                {etapas.map((c) => (
                  <td key={c.etapa} className="px-2 py-2 text-center tabular-nums">
                    {valor(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
