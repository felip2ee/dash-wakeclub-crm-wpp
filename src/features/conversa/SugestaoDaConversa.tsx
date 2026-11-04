import { useMutation } from "@tanstack/react-query";
import { Send, X } from "lucide-react";
import { type ButtonHTMLAttributes, useState } from "react";
import { toast } from "sonner";

import { FolhaMotivos } from "@/features/aprovacao/FolhaMotivos";
import type { Decisao } from "@/features/aprovacao/motivos";
import { SugestaoIa } from "@/features/aprovacao/SugestaoIa";
import { cn } from "@/lib/utils";
import { decidirFollowup, type EntradaDecisao } from "@/server/aprovacao";
import type { LinhaDoTempo } from "@/server/conversas";

type Sugestao = NonNullable<LinhaDoTempo["sugestao"]>;

// "Sugestão da IA" no pé da conversa (referência 01, direita), com o mesmo fluxo de
// /aprovar: decidir abre a folha de motivos e a decisão só sobe quando ela fecha.
export function SugestaoDaConversa({
  sugestao,
  onDecidido,
}: {
  sugestao: Sugestao;
  onDecidido: () => void;
}) {
  const [texto, setTexto] = useState(sugestao.texto);
  const [pendente, setPendente] = useState<Decisao | null>(null);

  const decisao = useMutation({
    mutationFn: (e: { decisao: Decisao; motivos: string[]; textoLivre: string }) => {
      const comum = { followupId: sugestao.followupId, textoLivre: e.textoLivre || undefined };
      const editado = texto.trim() === sugestao.texto.trim() ? undefined : texto.trim();
      // Cast: a folha só oferece motivos da própria decisão e o Zod confere no servidor.
      const data = (
        e.decisao === "enviar"
          ? { ...comum, decisao: e.decisao, motivos: e.motivos, texto: editado }
          : { ...comum, decisao: e.decisao, motivos: e.motivos }
      ) as EntradaDecisao;
      return decidirFollowup({ data });
    },
    onSuccess: (_r, e) =>
      toast.success(e.decisao === "enviar" ? "Aprovado para envio." : "Follow-up descartado."),
    onError: (erro) =>
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar."),
    onSettled: onDecidido,
  });

  const ocupado = decisao.isPending || pendente !== null;

  return (
    <div className="space-y-3 border-t border-border bg-background px-3 pb-3 pt-3">
      <SugestaoIa texto={texto} onTextoChange={setTexto} modo={sugestao.modo} />
      <div className="flex justify-center gap-12">
        <BotaoRedondo
          rotulo="Não enviar"
          disabled={ocupado}
          onClick={() => setPendente("recusar")}
          className="bg-secondary text-primary hover:bg-secondary/80"
        >
          <X aria-hidden className="h-7 w-7" strokeWidth={3} />
        </BotaoRedondo>
        <BotaoRedondo
          rotulo="Enviar"
          disabled={ocupado || !texto.trim()}
          onClick={() => setPendente("enviar")}
          className="bg-gradiente-primario text-white hover:opacity-90"
        >
          <Send aria-hidden className="h-6 w-6" />
        </BotaoRedondo>
      </div>
      <FolhaMotivos
        decisao={pendente}
        onConcluir={(motivos, textoLivre) => {
          if (!pendente) return;
          decisao.mutate({ decisao: pendente, motivos, textoLivre });
          setPendente(null);
        }}
      />
    </div>
  );
}

// Mesmo botão redondo do card de /aprovar (CardAprovacao), um pouco menor.
function BotaoRedondo({
  rotulo,
  className,
  children,
  ...props
}: { rotulo: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <span className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={rotulo}
        className={cn(
          "inline-flex h-14 w-14 items-center justify-center rounded-full shadow-md transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
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
