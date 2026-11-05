import { Flame, MessageSquareText, Search } from "lucide-react";
import { useState } from "react";

import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { ChipTemperatura } from "@/components/ui/chip-temperatura";
import { Input } from "@/components/ui/input";
import { diaRelativo, hora, telefone as fmtTelefone } from "@/lib/formato";
import { cn } from "@/lib/utils";

import { type FiltroConversa, type ItemConversa, filtrarConversas } from "./filtro";

const CHIPS: { valor: FiltroConversa; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "nao-lidas", rotulo: "Não lidas" },
  { valor: "followups", rotulo: "Follow-ups" },
  { valor: "quentes", rotulo: "Quentes" },
];

/** Hoje → "14:35"; ontem → "Ontem"; antes → "28/07". */
function quando(iso: string | null): string {
  if (!iso) return "";
  const dia = diaRelativo(iso);
  if (dia === "hoje") return hora(iso);
  return dia === "ontem" ? "Ontem" : dia.slice(0, 5);
}

// Lista "Conversas" (referência 05, primeira tela), em `/` e `/meus-leads`.
export function ListaConversas({
  itens,
  selecionado,
  onSelecionar,
}: {
  itens: ItemConversa[];
  selecionado?: string;
  onSelecionar: (id: string) => void;
}) {
  const [filtro, setFiltro] = useState<FiltroConversa>("todas");
  const [busca, setBusca] = useState("");
  const lista = filtrarConversas(itens, filtro, busca);
  const naoLidas = itens.filter((c) => c.aguardandoEquipe).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 px-4 pb-3 pt-4">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold">Conversas</h1>
            <p className="text-muted-foreground">Atendimentos e leads do WhatsApp</p>
          </div>
          {naoLidas > 0 && (
            <span className="shrink-0 rounded-full bg-gradiente-primario px-3 py-1 text-sm font-semibold text-white tabular-nums">
              {naoLidas} não {naoLidas === 1 ? "lida" : "lidas"}
            </span>
          )}
        </header>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone ou mensagem"
            aria-label="Buscar conversas"
            inputMode="search"
            className="h-11 rounded-full pl-10"
          />
        </div>
        <div role="group" aria-label="Filtrar conversas" className="flex gap-2 overflow-x-auto">
          {CHIPS.map((c) => (
            <button
              key={c.valor}
              type="button"
              aria-pressed={filtro === c.valor}
              onClick={() => setFiltro(c.valor)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filtro === c.valor
                  ? "border-transparent bg-gradiente-primario text-white"
                  : "border-border bg-card hover:bg-accent",
              )}
            >
              {c.rotulo}
              {c.valor === "nao-lidas" && naoLidas > 0 && (
                <span className="rounded-full bg-secondary px-1.5 text-xs text-secondary-foreground tabular-nums">
                  {naoLidas}
                </span>
              )}
              {c.valor === "quentes" && (
                <Flame aria-hidden className="h-4 w-4 fill-quente text-quente" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* No celular a lista rola por baixo da barra inferior; o fim fica acima dela. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(0.75rem+var(--barra-inferior))] md:pb-3">
        {lista.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            <MessageSquareText aria-hidden className="mx-auto mb-2 h-8 w-8 opacity-40" />
            {itens.length === 0 ? "Nenhuma conversa ainda." : "Nenhuma conversa com esse filtro."}
          </div>
        ) : (
          <ul className="space-y-2">
            {lista.map((c) => {
              const nome = c.nome ?? fmtTelefone(c.telefone);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelecionar(c.id)}
                    aria-current={c.id === selecionado ? "true" : undefined}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      c.id === selecionado && "border-primary/50 bg-accent",
                    )}
                  >
                    <AvatarIniciais nome={nome} tamanho="lg" className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold">{nome}</span>
                        <span
                          className="shrink-0 text-xs text-muted-foreground"
                          suppressHydrationWarning
                        >
                          {quando(c.ultimaMsgEm)}
                        </span>
                      </span>
                      <ChipTemperatura temperatura={c.temperatura} className="mt-0.5" />
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                          {c.ultimaTexto ?? "Sem mensagens"}
                        </span>
                        {c.msgsLeadSemResposta > 0 && (
                          <span
                            aria-label={`${c.msgsLeadSemResposta} sem resposta`}
                            className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-gradiente-primario px-1.5 text-xs font-bold text-white"
                          >
                            {c.msgsLeadSemResposta}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
