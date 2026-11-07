import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Flame, Info, Leaf, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { definirRitmoAdmin, getRitmo } from "@/server/admin-ia";

export const CHAVE_RITMO = ["admin", "ritmo"];

const MODOS = [
  { valor: "conservador", titulo: "Conservador", cota: 20, icone: Leaf },
  { valor: "aquecido", titulo: "Aquecido", cota: 60, icone: Flame },
] as const;

// Modo de follow-up (spec fases 2-3 §7, referência 02): escolher o cartão e confirmar.
// O aquecido é o modo perigoso; o botão "Confirmar alteração" é a confirmação explícita.
export function Ritmo() {
  const queryClient = useQueryClient();
  const ritmo = useQuery({ queryKey: CHAVE_RITMO, queryFn: () => getRitmo() });
  const [escolha, setEscolha] = useState<"conservador" | "aquecido" | null>(null);
  const atual = ritmo.data?.modo;
  const selecionado = escolha ?? atual;

  const confirmar = useMutation({
    mutationFn: (modo: "conservador" | "aquecido") =>
      definirRitmoAdmin({ data: { modo, confirmar: modo === "aquecido" } }),
    onSuccess: ({ modo }) => {
      toast.success(`Modo ${modo} ligado.`);
      setEscolha(null);
    },
    onError: (erro) =>
      toast.error(erro instanceof Error ? erro.message : "Falha ao trocar o modo."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CHAVE_RITMO }),
  });

  if (ritmo.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não deu para carregar o modo de follow-up.{" "}
        <button type="button" className="underline" onClick={() => void ritmo.refetch()}>
          Tentar de novo
        </button>
      </p>
    );
  }
  if (!ritmo.data) return <Skeleton aria-label="Carregando" className="h-40 rounded-lg" />;

  return (
    <div className="space-y-3">
      <RadioGroupPrimitive.Root
        aria-label="Modo de follow-up"
        value={selecionado}
        onValueChange={(v) => setEscolha(v as "conservador" | "aquecido")}
        className="grid grid-cols-2 gap-3"
      >
        {MODOS.map((m) => (
          <RadioGroupPrimitive.Item
            key={m.valor}
            value={m.valor}
            className="group rounded-xl border border-border p-3 text-center transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-transparent data-[state=checked]:bg-gradiente-primario data-[state=checked]:text-white motion-reduce:transition-none"
          >
            <span className="flex items-center justify-center gap-2 font-semibold">
              <m.icone aria-hidden className="h-4 w-4" />
              {m.titulo}
            </span>
            <span className="block font-display text-2xl font-bold">{m.cota}/dia</span>
            <span className="block text-xs">Até {m.cota} envios por dia (em todo o CRM)</span>
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>

      {selecionado === "aquecido" && (
        <p
          role="note"
          className="flex items-start gap-2 rounded-lg border border-warning/60 bg-warning/15 p-3 text-sm"
        >
          <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            <strong>Atenção:</strong> este modo aumenta significativamente o volume de contatos e
            pode exigir mais disponibilidade da equipe.
          </span>
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        Enviados hoje: {ritmo.data.enviadosHoje} de {ritmo.data.cotaDia} · intervalo de{" "}
        {ritmo.data.intervaloSegundos} s entre envios.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <p className="flex min-w-48 flex-1 items-center gap-2 text-xs text-muted-foreground">
          <Info aria-hidden className="h-4 w-4 shrink-0" />O limite é redefinido automaticamente à
          meia-noite (00:00): o aquecido volta para o conservador.
        </p>
        <Button
          className="min-h-11 bg-gradiente-primario text-white"
          disabled={!selecionado || selecionado === atual || confirmar.isPending}
          onClick={() => selecionado && confirmar.mutate(selecionado)}
        >
          <Check aria-hidden className="h-4 w-4" />
          Confirmar alteração
        </Button>
      </div>
    </div>
  );
}
