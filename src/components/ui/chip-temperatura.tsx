import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";

type Temperatura = "quente" | "morno" | "frio";

const ESTILO: Record<Temperatura, { texto: string; classe: string }> = {
  quente: { texto: "Quente", classe: "bg-quente text-white" },
  morno: { texto: "Morno", classe: "bg-morno text-warning-foreground" },
  frio: { texto: "Frio", classe: "bg-frio text-white" },
};

// Chip de temperatura do lead (referências 01, 04 e 05); a chama só no quente.
// Sem temperatura conhecida não mostra nada.
export function ChipTemperatura({
  temperatura,
  className,
}: {
  temperatura: Temperatura | null;
  className?: string;
}) {
  if (!temperatura) return null;
  const { texto, classe } = ESTILO[temperatura];
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {temperatura === "quente" && (
        <Flame aria-hidden className="h-4 w-4 fill-quente text-quente" />
      )}
      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", classe)}>
        {texto}
      </span>
    </span>
  );
}
