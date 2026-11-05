import { Clock } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { textoMinutos } from "@/lib/formato";
import type { ResumoComercial } from "@/server/comercial";

// Tempo de primeira resposta e leads novos ainda sem resposta (spec §4.3).
export function Atendimento({ comercial }: { comercial: ResumoComercial | undefined }) {
  const a = comercial?.atendimento;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="flex items-start gap-3">
        <Clock aria-hidden className="mt-0.5 h-6 w-6 shrink-0" />
        <div>
          <h2 className="font-display text-lg font-semibold">Atendimento</h2>
          <p className="text-sm text-muted-foreground">Velocidade com os leads novos</p>
        </div>
      </header>
      {a ? (
        <dl className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-1">
          <div>
            <dt className="text-sm font-medium">Primeira resposta (mediana)</dt>
            <dd className="font-display text-2xl font-bold tabular-nums">
              {textoMinutos(a.medianaPrimeiraRespostaMin.atual)}
            </dd>
            <dd className="text-xs text-muted-foreground">
              antes: {textoMinutos(a.medianaPrimeiraRespostaMin.anterior)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium">Leads novos sem resposta</dt>
            <dd className="font-display text-2xl font-bold tabular-nums">{a.semResposta}</dd>
          </div>
        </dl>
      ) : (
        <Skeleton className="mt-4 h-24 rounded-lg" />
      )}
    </section>
  );
}
