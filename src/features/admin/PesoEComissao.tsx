import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { alterarPesoComissao } from "@/server/admin-motor";

type Linha = { usuarioId: string; nome: string; peso: number; comissaoPct: number };

function LinhaPeso({ a }: { a: Linha }) {
  const router = useRouter();
  const [peso, setPeso] = useState(String(a.peso));
  const [pct, setPct] = useState(String(a.comissaoPct));
  const salvar = useMutation({
    mutationFn: () =>
      alterarPesoComissao({
        data: { usuarioId: a.usuarioId, peso: Number(peso), comissaoPct: Number(pct) },
      }),
    onSuccess: () => toast.success(`Peso e comissão de ${a.nome} salvos.`),
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao salvar."),
    onSettled: () => router.invalidate(),
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="min-w-32 flex-1 text-sm font-medium">{a.nome}</span>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Peso
        <Input
          type="number"
          min={0}
          max={10}
          step={1}
          className="w-20"
          value={peso}
          onChange={(e) => setPeso(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Comissão %
        <Input
          type="number"
          min={0}
          max={100}
          step={0.01}
          className="w-24"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
        />
      </label>
      <Button size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
        Salvar
      </Button>
    </div>
  );
}

export function PesoEComissao({ atendentes }: { atendentes: Linha[] }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">Peso e comissão</CardTitle>
        <p className="text-xs text-muted-foreground">
          Peso 0 pausa a atendente: não recebe lead novo.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {atendentes.map((a) => (
          <LinhaPeso key={a.usuarioId} a={a} />
        ))}
      </CardContent>
    </Card>
  );
}
