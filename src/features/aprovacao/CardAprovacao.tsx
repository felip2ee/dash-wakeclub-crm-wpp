import { Link } from "@tanstack/react-router";
import {
  Briefcase,
  ChevronRight,
  Clock,
  MessageCircle,
  MessageSquare,
  Send,
  X,
} from "lucide-react";
import { type ButtonHTMLAttributes, useState } from "react";

import { ChipTemperatura } from "@/components/ui/chip-temperatura";
import { desde, plural, telefone } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { CardAprovacao as Card } from "@/server/aprovacao";

import type { Decisao } from "./motivos";
import { SugestaoIa } from "./SugestaoIa";

const TEMPERATURAS = ["quente", "morno", "frio"] as const;

// Um card da fila "Para avaliar" (referência 01, esquerda). Ocupa a altura do trilho
// com snap; o texto editado sobe junto com a decisão.
export function CardAprovacao({
  card,
  admin,
  ocupado,
  onDecidir,
}: {
  card: Card;
  admin: boolean;
  ocupado: boolean;
  onDecidir: (decisao: Decisao, texto: string) => void;
}) {
  const [texto, setTexto] = useState(card.textoSugerido);
  const nome = card.nome ?? telefone(card.telefone);
  const temperatura = TEMPERATURAS.find((t) => t === card.temperatura) ?? null;
  // Mensagens vêm em ordem cronológica; a referência mostra a última do lead.
  const ultima = [...card.mensagens].reverse().find((m) => m.direcao === "lead" && m.texto) ?? null;

  return (
    <article
      aria-label={nome}
      className="mx-auto flex h-full w-full max-w-[480px] flex-col overflow-y-auto rounded-3xl border border-border bg-card"
    >
      <header className="space-y-3 bg-gradiente-primario-suave p-[calc(1.25rem*var(--espaco))]">
        <h2 className="break-words font-display text-4xl font-bold leading-tight">{nome}</h2>
        <ChipTemperatura temperatura={temperatura} />
        <p className="flex items-center gap-3">
          <Briefcase aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground" />
          {card.etiqueta}
        </p>
        {card.horasEstimadas != null && (
          <p className="flex items-center gap-3">
            <Clock aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground" />
            {plural(card.horasEstimadas, "hora", "horas")}
          </p>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-[calc(1rem*var(--espaco))] p-[calc(1rem*var(--espaco))]">
        {ultima && (
          <section aria-label="Última mensagem">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <MessageSquare aria-hidden className="h-4 w-4 shrink-0" />
              Última mensagem
              <span className="ml-auto">{desde(ultima.enviadaEm)}</span>
            </p>
            <p className="mt-1 line-clamp-4 text-lg">“{ultima.texto}”</p>
          </section>
        )}

        <SugestaoIa texto={texto} onTextoChange={setTexto} modo={card.modo} />

        <div className="mt-auto flex justify-center gap-12">
          <BotaoRedondo
            rotulo="Não enviar"
            disabled={ocupado}
            onClick={() => onDecidir("recusar", texto)}
            className="bg-secondary text-primary hover:bg-secondary/80"
          >
            <X aria-hidden className="h-8 w-8" strokeWidth={3} />
          </BotaoRedondo>
          <BotaoRedondo
            rotulo="Enviar"
            disabled={ocupado || !texto.trim()}
            onClick={() => onDecidir("enviar", texto)}
            className="bg-gradiente-primario text-white hover:opacity-90"
          >
            <Send aria-hidden className="h-7 w-7" />
          </BotaoRedondo>
        </div>

        <Link
          to={admin ? "/" : "/meus-leads"}
          search={{ lead: card.leadId }}
          className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-border font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MessageCircle aria-hidden className="h-5 w-5" />
          Ver conversa completa
          <ChevronRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

function BotaoRedondo({
  rotulo,
  className,
  children,
  ...props
}: { rotulo: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <span className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label={rotulo}
        className={cn(
          "inline-flex h-16 w-16 items-center justify-center rounded-full shadow-md transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </button>
      <span aria-hidden className="text-sm font-medium">
        {rotulo}
      </span>
    </span>
  );
}
