import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getVarredura,
  iniciarVarreduraAdmin,
  type PainelVarredura,
} from "@/server/admin-varredura";

function situacao(atual: PainelVarredura["atual"]): string | null {
  if (!atual) return null;
  if (atual.status === "rodando") return `analisando ${atual.analisados} de ${atual.total}`;
  if (atual.status === "concluida") {
    // Falha da IA também reagenda o follow-up, então conta como adiado.
    const adiados = atual.analisados - atual.sugeridos - atual.barrados;
    const partes = [
      `${atual.sugeridos} viraram sugestão`,
      `${atual.barrados} ${atual.barrados === 1 ? "barrado" : "barrados"}`,
    ];
    if (adiados > 0) partes.push(`${adiados} ${adiados === 1 ? "adiado" : "adiados"}`);
    return partes.join(", ");
  }
  return `A varredura falhou: ${atual.erro ?? "erro desconhecido"}`;
}

function motivoBloqueio(p: PainelVarredura | undefined): string | undefined {
  if (p?.atual?.status === "rodando") return "Já existe uma varredura em andamento.";
  if (p && !p.iaDisponivel) return "IA indisponível: configure OPENAI_API_KEY.";
  return undefined;
}

// "Buscar follow-ups agora" (spec pipeline §7): confirma com s/N porque cada análise é uma
// chamada paga, acompanha o progresso e, no fim, recarrega a fila de aprovação.
export function BotaoVarredura() {
  const cliente = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [resposta, setResposta] = useState("");

  const painel = useQuery({
    queryKey: ["varredura"],
    queryFn: () => getVarredura(),
    refetchInterval: (q) => (q.state.data?.atual?.status === "rodando" ? 2000 : false),
  });
  const status = painel.data?.atual?.status;

  // Saiu de "rodando": as sugestões novas já estão na fila de cada dono.
  const antes = useRef(status);
  useEffect(() => {
    if (antes.current === "rodando" && status !== "rodando") {
      void cliente.invalidateQueries({ queryKey: ["aprovacao"] });
    }
    antes.current = status;
  }, [status, cliente]);

  const iniciar = useMutation({
    mutationFn: () => iniciarVarreduraAdmin({ data: { confirmo: "s" } }),
    onSuccess: () => {
      setAberto(false);
      setResposta("");
    },
    onError: (erro) =>
      toast.error(erro instanceof Error ? erro.message : "Não foi possível iniciar a varredura."),
    onSettled: () => cliente.invalidateQueries({ queryKey: ["varredura"] }),
  });

  const motivo = motivoBloqueio(painel.data);

  return (
    <div className="flex w-full flex-col gap-1 sm:w-auto sm:items-end">
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={!painel.data || motivo !== undefined}
        title={motivo}
        onClick={() => setAberto(true)}
      >
        Buscar follow-ups agora
      </Button>
      <p aria-live="polite" className="text-sm text-muted-foreground tabular-nums">
        {/* O title do botão não chega ao toque; rodando, o progresso já explica o bloqueio. */}
        {status !== "rodando" && motivo ? motivo : situacao(painel.data?.atual ?? null)}
      </p>

      <Dialog
        open={aberto}
        onOpenChange={(o) => {
          setAberto(o);
          if (!o) setResposta("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buscar follow-ups agora</DialogTitle>
            <DialogDescription>
              {painel.data?.aAnalisar ?? 0} follow-ups serão analisados (cada um é uma chamada paga
              à OpenAI).
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (resposta === "s") iniciar.mutate();
            }}
          >
            <label className="block space-y-2 text-sm font-medium">
              <span>Digite s para confirmar (s/N)</span>
              <Input
                value={resposta}
                onChange={(e) => setResposta(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                className="min-h-11"
              />
            </label>
            <DialogFooter>
              <Button
                type="submit"
                className="min-h-11 bg-gradiente-primario text-white"
                disabled={resposta !== "s" || iniciar.isPending}
              >
                Analisar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
