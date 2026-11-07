import {
  Archive,
  Coins,
  CreditCard,
  GraduationCap,
  Headset,
  Hourglass,
  Link2,
  Sprout,
  Target,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { moeda, plural } from "@/lib/formato";
import type { LeadPipeline } from "@/server/leads";
import type { ColunaPipeline } from "@/lib/pipeline";
import { CardLead } from "./CardLead";

const ICONES: Record<ColunaPipeline<LeadPipeline>["etapa"], LucideIcon> = {
  "Novo lead": Sprout,
  "Em atendimento": Headset,
  "Link enviado": Link2,
  Cadastrado: UserCheck,
  "Aguardando pagamento": CreditCard,
  "Aluno com horas": GraduationCap,
  "Aluno sem horas": Hourglass,
  Encerrado: Archive,
};

// Coluna grande demais vira rolagem infinita; mostra as primeiras e um "+ n leads" (referência 05).
const VISIVEIS = 20;

export function ColunaEtapa({ coluna }: { coluna: ColunaPipeline<LeadPipeline> }) {
  const [todos, setTodos] = useState(false);
  const Icone = ICONES[coluna.etapa];
  const cards = todos ? coluna.cards : coluna.cards.slice(0, VISIVEIS);
  const escondidos = coluna.quantidade - cards.length;

  return (
    <section
      aria-label={coluna.etapa}
      className="flex w-[85vw] max-w-[300px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border bg-card sm:w-[280px]"
    >
      <header className="flex items-center gap-2 bg-gradiente-primario px-3 py-2.5 text-white">
        <Icone aria-hidden className="h-5 w-5 shrink-0" />
        <h3 className="min-w-0 flex-1 font-semibold leading-tight">{coluna.etapa}</h3>
        <span className="shrink-0 rounded-full border border-white/70 px-2 py-0.5 text-xs font-semibold">
          {plural(coluna.quantidade, "lead", "leads")}
        </span>
      </header>

      <dl className="space-y-1 border-b border-border px-3 py-2.5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            <Coins aria-hidden className="h-4 w-4" /> Valor cheio
          </dt>
          <dd className="font-semibold tabular-nums">{moeda(coluna.valorCheio)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            <Target aria-hidden className="h-4 w-4" /> Valor esperado
          </dt>
          <dd className="font-semibold tabular-nums">{moeda(coluna.valorEsperado)}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2 p-2">
        {cards.map((lead) => (
          <CardLead key={lead.id} lead={lead} />
        ))}
        {coluna.quantidade === 0 && (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhum lead nesta etapa
          </p>
        )}
        {escondidos > 0 && (
          <button
            type="button"
            onClick={() => setTodos(true)}
            className="mx-auto min-h-11 rounded-full border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            + {plural(escondidos, "lead", "leads")}
          </button>
        )}
      </div>
    </section>
  );
}
