import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hourglass } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Prazos } from "@/server/motor/parado";
import { definirPrazosParado, getPrazosParado } from "@/server/prazos";
import { Carregando, ErroAoCarregar, Secao } from "./Secao";

const CHAVE_PRAZOS = ["configuracoes", "prazos-parado"];

const CAMPOS: { chave: keyof Prazos; rotulo: string }[] = [
  { chave: "emAtendimentoH", rotulo: "Em atendimento (h)" },
  { chave: "linkEnviadoH", rotulo: "Link enviado (h)" },
  { chave: "cadastradoH", rotulo: "Cadastrado (h)" },
  { chave: "alunoComHorasDias", rotulo: "Aluno com horas (dias)" },
  { chave: "alunoSemHorasDias", rotulo: "Aluno sem horas (dias)" },
  { chave: "silencioAlunosH", rotulo: "Silêncio dos alunos (h)" },
  { chave: "pagamentoPendenteH", rotulo: "Pagamento pendente (h)" },
];

export function PrazosParado() {
  const queryClient = useQueryClient();
  const prazos = useQuery({ queryKey: CHAVE_PRAZOS, queryFn: () => getPrazosParado() });
  const [campos, setCampos] = useState<Record<string, string>>({});

  useEffect(() => {
    if (prazos.data)
      setCampos(Object.fromEntries(CAMPOS.map(({ chave }) => [chave, String(prazos.data[chave])])));
  }, [prazos.data]);

  const salvar = useMutation({
    mutationFn: (valor: Prazos) => definirPrazosParado({ data: valor }),
    onSuccess: () => toast.success("Prazos de follow-up salvos."),
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao salvar."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CHAVE_PRAZOS }),
  });

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const valor = Object.fromEntries(CAMPOS.map(({ chave }) => [chave, Number(campos[chave])]));
    if (Object.values(valor).some((n) => !Number.isInteger(n) || n < 1)) {
      toast.error("Cada prazo deve ser um número inteiro maior que zero.");
      return;
    }
    salvar.mutate(valor as Prazos);
  }

  return (
    <Secao
      id="prazos-parado"
      icone={Hourglass}
      titulo="Prazos de follow-up"
      subtitulo="Quanto tempo sem resposta até o lead contar como parado, por etapa."
    >
      {prazos.isError ? (
        <ErroAoCarregar
          texto="Não deu para carregar os prazos."
          tentar={() => void prazos.refetch()}
        />
      ) : !prazos.data ? (
        <Carregando className="h-24" />
      ) : (
        <form onSubmit={enviar} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {CAMPOS.map(({ chave, rotulo }) => (
              <label key={chave} className="space-y-1 text-sm">
                <span className="text-muted-foreground">{rotulo}</span>
                <Input
                  inputMode="numeric"
                  className="h-11"
                  value={campos[chave] ?? ""}
                  onChange={(e) => setCampos((c) => ({ ...c, [chave]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <Button type="submit" className="min-h-11" disabled={salvar.isPending}>
            Salvar
          </Button>
        </form>
      )}
    </Secao>
  );
}
