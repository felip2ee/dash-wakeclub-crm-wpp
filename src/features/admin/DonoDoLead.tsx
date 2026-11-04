import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { corrigirDonoDoLead, getDonoDoLead } from "@/server/admin-motor";

const MOTIVO: Record<string, string> = {
  rodizio: "rodízio",
  mencao: "menção",
  desativacao: "desativação",
  admin: "admin",
};

export function DonoDoLead({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const chave = ["admin", "dono-do-lead", leadId];
  const { data } = useQuery({
    queryKey: chave,
    queryFn: () => getDonoDoLead({ data: { leadId } }),
  });
  const corrigir = useMutation({
    mutationFn: (usuarioId: string) => corrigirDonoDoLead({ data: { leadId, usuarioId } }),
    onSuccess: () => toast.success("Dono do lead corrigido."),
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao corrigir."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: chave }),
  });

  if (!data) return null;
  const dono = data.vendedores.find((v) => v.id === data.atendenteId);
  return (
    <div className="rounded-xl border border-border bg-background p-3 text-sm">
      <div className="text-xs text-muted-foreground">Dono</div>
      <div className="font-medium">
        {dono?.nome ?? (data.atendenteId ? "Atendente inativa" : "Sem dono")}
      </div>
      {data.atribuidoPor && (
        <div className="text-xs text-muted-foreground">
          atribuído por {MOTIVO[data.atribuidoPor] ?? data.atribuidoPor}
        </div>
      )}
      <Select
        value={data.atendenteId ?? ""}
        onValueChange={(v) => corrigir.mutate(v)}
        disabled={corrigir.isPending}
      >
        <SelectTrigger className="mt-2" aria-label="Corrigir dono do lead">
          <SelectValue placeholder="Corrigir dono" />
        </SelectTrigger>
        <SelectContent>
          {data.vendedores.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
