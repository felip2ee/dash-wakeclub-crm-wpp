import { Columns3, Sparkles } from "lucide-react";

// Faixa acima das colunas (referência 04): o Pipeline é espelho; quem move as
// etapas é a IA (qualificador), por isso não há arrastar card.
export function FaixaSomenteLeitura() {
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
      <Columns3 aria-hidden className="h-7 w-7 shrink-0" />
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-semibold">Pipeline de vendas</h2>
        <p className="text-sm text-muted-foreground">
          Leads organizados por etapa, com valores cheios e esperados
        </p>
      </div>
      <span className="inline-flex items-center gap-2 rounded-full bg-gradiente-primario px-4 py-1.5 text-sm font-medium text-white">
        <Sparkles aria-hidden className="h-4 w-4" />
        Somente leitura · etapas atualizadas pela IA
      </span>
    </section>
  );
}
