import { Bot, Check, CheckCheck, Mic, TriangleAlert } from "lucide-react";

import { hora, rotuloAutoria } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { Autoria, Direcao } from "@/server/conversas";

import { rotuloAudio } from "./linha-do-tempo";

export type MensagemConversa = {
  id: string;
  direcao: Direcao;
  texto: string | null;
  enviadaEm: string;
  entregaNivel: number | null;
  autoria: Autoria;
};

// Bolha da conversa (referência 01): lead escuro à esquerda, equipe em degradê à direita
// com hora e ✓/✓✓; a autoria fica embaixo da bolha da equipe.
export function Bolha({
  mensagem: m,
  audio,
}: {
  mensagem: MensagemConversa;
  /** Status da transcrição quando a mensagem é áudio; `undefined` = não é áudio. */
  audio?: string | null;
}) {
  const daEquipe = m.direcao !== "lead";
  const ehAudio = audio !== undefined;
  // Áudio decide pelo status: só o "ok" mostra o texto (a transcrição).
  const rotulo = ehAudio ? rotuloAudio(audio) : null;
  const texto = rotulo ?? m.texto;

  return (
    <div className={cn("flex flex-col", daEquipe ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 shadow-sm sm:max-w-[75%]",
          daEquipe
            ? "rounded-br-sm bg-gradiente-primario text-white"
            : "rounded-bl-sm bg-secondary text-secondary-foreground",
        )}
      >
        {/* A IA é marcada de propósito: quem lê precisa saber que aquilo saiu automático. */}
        {m.direcao === "ia" && (
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-white/85">
            <Bot aria-hidden className="h-3.5 w-3.5" /> Follow-up automático
          </p>
        )}
        {ehAudio && (
          <p
            className={cn(
              "mb-1 flex items-center gap-1 text-xs font-medium",
              daEquipe ? "text-white/85" : "text-muted-foreground",
            )}
          >
            <Mic aria-hidden className="h-3.5 w-3.5" /> Áudio{rotulo ? "" : " · transcrição"}
          </p>
        )}
        <p
          className={cn(
            "whitespace-pre-wrap break-words leading-relaxed",
            (rotulo || !m.texto) && "italic opacity-75",
          )}
        >
          {texto ?? "(sem texto)"}
        </p>
        <p
          className={cn(
            "mt-0.5 flex items-center justify-end gap-1 text-[11px]",
            daEquipe ? "text-white/80" : "text-muted-foreground",
          )}
          suppressHydrationWarning
        >
          <span>{hora(m.enviadaEm)}</span>
          {daEquipe && <Entrega nivel={m.entregaNivel} />}
        </p>
      </div>
      {daEquipe && (
        <p className="mt-0.5 px-1 text-[11px] text-muted-foreground">
          {m.direcao === "ia" ? "IA" : rotuloAutoria(m.autoria)}
        </p>
      )}
    </div>
  );
}

/** 0 erro · 1 pendente · 2 servidor · 3 entregue · 4 lido · 5 reproduzido */
function Entrega({ nivel }: { nivel: number | null }) {
  if (nivel === null) return null;
  if (nivel === 0) return <TriangleAlert aria-label="Erro no envio" className="h-3.5 w-3.5" />;
  if (nivel <= 2) return <Check aria-label="Enviada" className="h-3.5 w-3.5" />;
  if (nivel === 3) return <CheckCheck aria-label="Entregue" className="h-3.5 w-3.5" />;
  return <CheckCheck aria-label="Lida" className="h-3.5 w-3.5 text-sky-200" />;
}
