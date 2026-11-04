import { Check, Pencil, Sparkles } from "lucide-react";
import { useId, useState } from "react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Caixa "Sugestão da IA" (referência 01, nos dois lados): rótulo, modo do redator, botão
// "Editar" que troca o texto por um campo. Usada em /aprovar e na conversa (Task 4).
export function SugestaoIa({
  texto,
  onTextoChange,
  modo,
  className,
}: {
  texto: string;
  onTextoChange: (texto: string) => void;
  /** REABRIR | RETOMAR, como o redator grava. */
  modo?: string | null;
  className?: string;
}) {
  const [editando, setEditando] = useState(false);
  const idCampo = useId();

  return (
    <section
      aria-label="Sugestão da IA"
      className={cn(
        "rounded-2xl border border-primary/30 bg-gradiente-primario-suave p-[calc(0.75rem*var(--espaco))]",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden className="h-5 w-5 shrink-0 text-primary" />
        <span className="font-semibold">Sugestão da IA</span>
        {modo && (
          <span className="rounded-full bg-background/60 px-2 py-0.5 text-xs font-medium">
            {modo.charAt(0) + modo.slice(1).toLowerCase()}
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditando((v) => !v)}
          aria-expanded={editando}
          aria-controls={idCampo}
          className="-mr-2 ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium hover:bg-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {editando ? (
            <Check aria-hidden className="h-4 w-4" />
          ) : (
            <Pencil aria-hidden className="h-4 w-4" />
          )}
          {editando ? "Pronto" : "Editar"}
        </button>
      </div>
      {editando ? (
        <Textarea
          id={idCampo}
          aria-label="Texto da sugestão"
          autoFocus
          rows={4}
          maxLength={4000}
          value={texto}
          onChange={(e) => onTextoChange(e.target.value)}
          className="mt-2 bg-background/60"
        />
      ) : (
        <p
          id={idCampo}
          className="mt-2 whitespace-pre-wrap rounded-xl border border-border/60 bg-background/40 px-3 py-2"
        >
          {texto}
        </p>
      )}
    </section>
  );
}
