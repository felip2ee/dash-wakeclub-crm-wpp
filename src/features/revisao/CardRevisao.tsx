import { Check, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { desde, telefone } from "@/lib/formato";
import type { DecisaoParaRevisar } from "@/server/revisao";

// Um card da tela "Revisão das decisões": o que a IA sugeriu, o que a atendente decidiu
// e o botão Concordo / Discordo do admin, com observação opcional.
export function CardRevisao({
  decisao,
  ocupado,
  onRevisar,
}: {
  decisao: DecisaoParaRevisar;
  ocupado: boolean;
  onRevisar: (concorda: boolean, observacao: string) => void;
}) {
  const [observacao, setObservacao] = useState("");
  const { textoOriginal, textoEnviado } = decisao;
  const editado = textoEnviado != null && textoOriginal != null && textoEnviado !== textoOriginal;
  const enviou = decisao.decisao === "enviar";
  const nome = decisao.leadNome ?? telefone(decisao.telefone);

  return (
    <article
      aria-label={nome}
      className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-5"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="break-words font-display text-xl font-bold">{nome}</h2>
        <Badge variant="secondary">{decisao.etiqueta}</Badge>
        <span className="ml-auto text-sm text-muted-foreground">
          {decisao.vendedorNome} · {desde(decisao.decididoEm)}
        </span>
      </header>

      <Texto titulo="Sugestão da IA" texto={textoOriginal} />
      {editado && (
        <Texto titulo="Texto enviado (editado)" texto={textoEnviado} base={textoOriginal} />
      )}

      <section aria-label="Decisão da atendente" className="space-y-2">
        <p className="flex items-center gap-2 font-medium">
          {enviou ? (
            <Check aria-hidden className="h-4 w-4 text-primary" />
          ) : (
            <ThumbsDown aria-hidden className="h-4 w-4 text-destructive" />
          )}
          {enviou ? "Enviou" : "Não enviou"}
        </p>
        {decisao.motivos.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {decisao.motivos.map((m) => (
              <li key={m}>
                <Badge variant="outline">{m}</Badge>
              </li>
            ))}
          </ul>
        )}
        {decisao.textoLivre && (
          <p className="text-sm text-muted-foreground">“{decisao.textoLivre}”</p>
        )}
      </section>

      <div className="space-y-3">
        <Textarea
          aria-label="Observação do admin"
          placeholder="Observação (opcional)"
          maxLength={500}
          rows={2}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
        />
        <div className="flex gap-3">
          <Button
            type="button"
            className="min-h-11 flex-1"
            disabled={ocupado}
            onClick={() => onRevisar(true, observacao)}
          >
            <ThumbsUp aria-hidden className="h-4 w-4" />
            Concordo
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1"
            disabled={ocupado}
            onClick={() => onRevisar(false, observacao)}
          >
            <ThumbsDown aria-hidden className="h-4 w-4" />
            Discordo
          </Button>
        </div>
      </div>
    </article>
  );
}

// Com `base`, destaca as palavras que não estavam no texto original.
function Texto({
  titulo,
  texto,
  base,
}: {
  titulo: string;
  texto: string | null;
  base?: string | null;
}) {
  const antes = new Set((base ?? "").split(/\s+/));
  let pos = 0;
  const partes =
    texto == null || base == null
      ? texto
      : texto.split(/(\s+)/).map((p) => {
          const chave = pos;
          pos += p.length;
          return p.trim() && !antes.has(p) ? (
            <mark key={chave} className="rounded bg-primary/20 px-0.5 text-foreground">
              {p}
            </mark>
          ) : (
            <span key={chave}>{p}</span>
          );
        });
  return (
    <section aria-label={titulo}>
      <h3 className="text-sm text-muted-foreground">{titulo}</h3>
      <p className="mt-1 whitespace-pre-wrap break-words">{partes ?? "—"}</p>
    </section>
  );
}
