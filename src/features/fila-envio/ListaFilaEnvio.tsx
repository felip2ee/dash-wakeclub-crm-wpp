import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { desde, moeda, telefone } from "@/lib/formato";
import type { ItemFila } from "@/server/fila-envio";

// Lista ordenada como o envio vai consumir; "Remover" pede confirmação porque o texto aprovado
// se perde. A tela não envia nada: o envio é só da tarefa que respeita a cota do dia.
export function ListaFilaEnvio({
  itens,
  ocupado,
  onRemover,
}: {
  itens: ItemFila[];
  ocupado: boolean;
  onRemover: (followupId: string) => void;
}) {
  const [alvo, setAlvo] = useState<ItemFila | null>(null);

  return (
    <>
      <ol aria-label="Follow-ups aprovados na ordem de envio" className="space-y-2">
        {itens.map((i) => {
          const nome = i.leadNome ?? telefone(i.telefone);
          return (
            <li
              key={i.followupId}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-card p-4"
            >
              <span className="w-8 text-lg font-bold tabular-nums text-muted-foreground">
                {i.posicao}
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-semibold">{nome}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {i.etiqueta} · {i.vendedorNome ?? "sem vendedor"} · aprovado {desde(i.aprovadoEm)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {i.lembrete && <Badge>Lembrete de aula</Badge>}
                {i.reconferir && <Badge variant="outline">Será reconferido</Badge>}
                <span className="text-sm tabular-nums text-muted-foreground">
                  {moeda(i.valorEsperado)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={ocupado}
                  aria-label={`Remover ${nome} da fila`}
                  onClick={() => setAlvo(i)}
                >
                  Remover
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      <AlertDialog open={alvo !== null} onOpenChange={(o) => !o && setAlvo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da fila?</AlertDialogTitle>
            <AlertDialogDescription>
              {alvo?.leadNome ?? (alvo && telefone(alvo.telefone))} não receberá este follow-up.
              Isso não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              onClick={() => alvo && onRemover(alvo.followupId)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
