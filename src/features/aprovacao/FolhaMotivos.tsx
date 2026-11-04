import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { type Decisao, motivosDa, validarMotivos } from "./motivos";

// Folha de baixo depois de decidir (spec fases 2–3 §8): chips de motivo e campo livre.
// Fechar de qualquer jeito (Pular, arrastar, tocar fora) conclui sem motivos; a decisão
// só vai ao servidor aqui, numa chamada só.
export function FolhaMotivos({
  decisao,
  onConcluir,
}: {
  /** null = folha fechada. */
  decisao: Decisao | null;
  onConcluir: (motivos: string[], textoLivre: string) => void;
}) {
  const [motivos, setMotivos] = useState<string[]>([]);
  const [textoLivre, setTextoLivre] = useState("");
  // O Drawer pode avisar o fechamento depois do "Salvar"; conclui uma vez por abertura.
  const concluido = useRef(false);

  useEffect(() => {
    if (decisao) concluido.current = false;
  }, [decisao]);

  function concluir(comMotivos: boolean) {
    if (concluido.current) return;
    concluido.current = true;
    onConcluir(comMotivos ? motivos : [], comMotivos ? textoLivre.trim() : "");
    setMotivos([]);
    setTextoLivre("");
  }

  const alternar = (m: string) =>
    setMotivos((atuais) => (atuais.includes(m) ? atuais.filter((x) => x !== m) : [...atuais, m]));

  return (
    <Drawer open={decisao !== null} onOpenChange={(aberta) => !aberta && concluir(false)}>
      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader>
          <DrawerTitle>
            {decisao === "enviar" ? "Por que enviar?" : "Por que não enviar?"}
          </DrawerTitle>
          <DrawerDescription>Opcional. Ajuda a IA a acertar nos próximos.</DrawerDescription>
        </DrawerHeader>
        {decisao && (
          <div className="space-y-4 px-4">
            <div role="group" aria-label="Motivos" className="flex flex-wrap gap-2">
              {motivosDa(decisao).map((m) => {
                const marcado = motivos.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={marcado}
                    onClick={() => alternar(m)}
                    className={cn(
                      "min-h-11 rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      marcado
                        ? "border-transparent bg-gradiente-primario text-white"
                        : "border-border bg-card hover:bg-accent",
                    )}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
            <Textarea
              aria-label="Comentário (opcional)"
              placeholder="Quer contar mais? (opcional)"
              maxLength={500}
              rows={3}
              value={textoLivre}
              onChange={(e) => setTextoLivre(e.target.value)}
            />
          </div>
        )}
        <DrawerFooter className="flex-row">
          <Button variant="outline" className="min-h-11 flex-1" onClick={() => concluir(false)}>
            Pular
          </Button>
          <Button
            className="min-h-11 flex-1 bg-gradiente-primario text-white"
            disabled={!decisao || !validarMotivos(decisao, motivos)}
            onClick={() => concluir(true)}
          >
            Salvar e próximo
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
