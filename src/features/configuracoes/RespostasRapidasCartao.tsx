import { Link } from "@tanstack/react-router";
import { ChevronRight, MessageSquareText } from "lucide-react";

import { Secao } from "./Secao";

// A tela de respostas rápidas continua em /templates; aqui é só a porta de entrada.
export function RespostasRapidasCartao() {
  return (
    <Secao
      id="respostas-rapidas"
      icone={MessageSquareText}
      titulo="Respostas rápidas"
      subtitulo="Textos prontos que a equipe insere digitando /atalho na conversa."
    >
      <Link
        to="/templates"
        className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Gerenciar respostas rápidas
        <ChevronRight aria-hidden className="h-4 w-4" />
      </Link>
    </Secao>
  );
}
