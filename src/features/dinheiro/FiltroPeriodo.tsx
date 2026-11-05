import { CalendarDays } from "lucide-react";
import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Periodo } from "@/server/dinheiro";

import { type Atalho, atalhoDe, hoje, mesCorrente, ultimos7Dias } from "./periodo";

const ROTULOS: Record<Atalho, string> = {
  hoje: "Hoje",
  "7dias": "7 dias",
  mes: "Mês corrente",
  personalizado: "Personalizado",
};

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
  // Escolher "Personalizado" mantém as datas, que podem coincidir com um atalho.
  const [manual, setManual] = useState(false);
  const atalho = manual ? "personalizado" : atalhoDe(periodo);
  const escolher = (a: Atalho) => {
    setManual(a === "personalizado");
    if (a === "hoje") onChange(hoje());
    else if (a === "7dias") onChange(ultimos7Dias());
    else if (a === "mes") onChange(mesCorrente());
  };
  return (
    <fieldset className="inline-flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-1 text-sm">
      <legend className="sr-only">Período</legend>
      <CalendarDays aria-hidden className="h-4 w-4" />
      <span aria-hidden className="font-semibold">
        Período:
      </span>
      <Select value={atalho} onValueChange={(v) => escolher(v as Atalho)}>
        <SelectTrigger aria-label="Atalho de período" className="min-h-9 w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(ROTULOS) as Atalho[]).map((a) => (
            <SelectItem key={a} value={a}>
              {ROTULOS[a]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {atalho === "personalizado" && (
        <>
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
        </>
      )}
    </fieldset>
  );
}
