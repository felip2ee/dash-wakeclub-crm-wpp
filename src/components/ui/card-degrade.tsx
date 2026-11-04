import { Info, type LucideIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Cartão de KPI em degradê do tema (referência 03): ícone + título, valor
// grande e legenda. `info` vira o botão ⓘ com a explicação do número.
export function CardDegrade({
  titulo,
  valor,
  legenda,
  icone: Icone,
  info,
  className,
}: {
  titulo: string;
  valor: string;
  legenda?: string;
  icone?: LucideIcon;
  info?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl bg-gradiente-primario p-4 text-white shadow-sm", className)}>
      <div className="flex items-center gap-2">
        {Icone && <Icone aria-hidden className="h-5 w-5 shrink-0" />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{titulo}</span>
        {info && (
          <Popover>
            <PopoverTrigger
              aria-label={`Sobre ${titulo}`}
              className="-m-2.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Info aria-hidden className="h-4 w-4" />
            </PopoverTrigger>
            <PopoverContent className="max-w-xs text-sm">{info}</PopoverContent>
          </Popover>
        )}
      </div>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{valor}</p>
      {legenda && <p className="text-sm font-medium">{legenda}</p>}
    </div>
  );
}
