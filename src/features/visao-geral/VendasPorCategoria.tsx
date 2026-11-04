import { BarChart3, CalendarDays, Headphones, RefreshCw, Sparkles } from "lucide-react";

const CATEGORIAS = [
  { nome: "Follow-up", icone: CalendarDays },
  { nome: "Atendimento", icone: Headphones },
  { nome: "Recompra", icone: RefreshCw },
  { nome: "Espontânea", icone: Sparkles },
];

// Estrutura da referência 03 com traço no lugar dos valores: as vendas chegam na fase 4.
export function VendasPorCategoria() {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="flex items-start gap-3">
        <BarChart3 aria-hidden className="mt-0.5 h-6 w-6 shrink-0" />
        <div>
          <h2 className="font-display text-lg font-semibold">Vendas por categoria</h2>
          <p className="text-sm text-muted-foreground">Valor e quantidade de vendas no período</p>
        </div>
      </header>
      <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:divide-x md:divide-border">
        {CATEGORIAS.map(({ nome, icone: Icone }) => (
          <li key={nome} className="md:px-3 md:first:pl-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Icone aria-hidden className="h-4 w-4" /> {nome}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-muted-foreground">—</p>
            <p className="text-xs text-muted-foreground">Ainda sem vendas pelo webhook</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
