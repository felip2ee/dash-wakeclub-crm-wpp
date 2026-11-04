import { CalendarDays } from "lucide-react";

import type { Periodo } from "@/server/dinheiro";

const CAMPO =
  "min-h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// Filtro "Período" da referência 03 com as datas nativas do navegador (de/até, inclusive).
export function FiltroPeriodo({
  periodo,
  onChange,
}: {
  periodo: Periodo;
  onChange: (p: Periodo) => void;
}) {
  return (
    <fieldset className="inline-flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-1 text-sm">
      <legend className="sr-only">Período</legend>
      <CalendarDays aria-hidden className="h-4 w-4" />
      <span aria-hidden className="font-semibold">
        Período:
      </span>
      <input
        type="date"
        aria-label="De"
        value={periodo.de}
        max={periodo.ate}
        onChange={(e) => e.target.value && onChange({ ...periodo, de: e.target.value })}
        className={CAMPO}
      />
      <span aria-hidden>–</span>
      <input
        type="date"
        aria-label="Até"
        value={periodo.ate}
        min={periodo.de}
        onChange={(e) => e.target.value && onChange({ ...periodo, ate: e.target.value })}
        className={CAMPO}
      />
    </fieldset>
  );
}
