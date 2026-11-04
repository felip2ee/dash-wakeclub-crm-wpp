import type { LucideIcon } from "lucide-react";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Moldura dos cartões de /configuracoes (referência 02): ícone, título, subtítulo,
// ação à direita e o conteúdo. `id` serve de âncora (ex.: /configuracoes#fila).
export function Secao({
  id,
  icone: Icone,
  titulo,
  subtitulo,
  acao,
  className,
  children,
}: {
  id: string;
  icone: LucideIcon;
  titulo: string;
  subtitulo?: string;
  acao?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titulo`}
      className={cn("scroll-mt-20 rounded-xl border border-border bg-card p-4", className)}
    >
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <Icone aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-titulo`} className="font-display text-lg font-semibold">
            {titulo}
          </h2>
          {subtitulo && <p className="text-sm text-muted-foreground">{subtitulo}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function Carregando({ className }: { className?: string }) {
  return <Skeleton aria-label="Carregando" className={cn("h-24 w-full rounded-lg", className)} />;
}

export function ErroAoCarregar({ texto, tentar }: { texto: string; tentar: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
    >
      <TriangleAlert aria-hidden className="h-5 w-5 shrink-0 text-destructive" />
      <span className="flex-1">{texto}</span>
      <button
        type="button"
        onClick={tentar}
        className="min-h-11 rounded-full border border-border px-4 font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Tentar de novo
      </button>
    </div>
  );
}
