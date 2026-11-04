import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { dataHora } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { getPainelIa } from "@/server/admin-ia";

export const CHAVE_PAINEL_IA = ["admin", "painel-ia"];

// Estado da IA e do follow-up (spec fases 2-3 §10): o que está configurado, o que está
// na fila de cada etapa e quando cada tarefa agendada rodou pela última vez.
export function PainelIa() {
  const ia = useQuery({
    queryKey: CHAVE_PAINEL_IA,
    queryFn: () => getPainelIa(),
    refetchInterval: 60_000,
  });

  if (ia.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não deu para carregar o painel da IA.{" "}
        <button type="button" className="underline" onClick={() => void ia.refetch()}>
          Tentar de novo
        </button>
      </p>
    );
  }
  if (!ia.data) return <Skeleton aria-label="Carregando" className="h-40 rounded-lg" />;

  const d = ia.data;
  const tarefas = Object.entries(d.ultimaExecucao).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Item
          rotulo="Chave da IA"
          valor={d.chaveConfigurada ? "configurada" : "ausente"}
          grave={!d.chaveConfigurada}
        />
        <Item
          rotulo="Adaptador WhatsApp"
          valor={d.adaptadorPresente ? "presente" : "ausente"}
          grave={!d.adaptadorPresente}
        />
        <Item rotulo="Transcrições pendentes" valor={d.transcricoesPendentes} />
        <Item rotulo="Leads a qualificar" valor={d.leadsAQualificar} />
        <Item rotulo="Aprovados a enviar" valor={d.aprovadosAEnviar} />
      </dl>

      <div>
        <h3 className="mb-1 font-medium">Aguardando aprovação por vendedor</h3>
        {d.aguardandoAprovacaoPorVendedor.length === 0 ? (
          <p className="text-muted-foreground">Nada aguardando aprovação.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {d.aguardandoAprovacaoPorVendedor.map((v) => (
              <li key={v.vendedorId} className="flex justify-between gap-2 px-3 py-2">
                <span>{v.nome}</span>
                <span className="font-semibold tabular-nums">{v.quantidade}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-1 font-medium">Última execução por tarefa</h3>
        {tarefas.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma tarefa rodou ainda.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {tarefas.map(([nome, quando]) => (
              <li key={nome} className="flex justify-between gap-2 px-3 py-2">
                <span className="font-mono text-xs">{nome}</span>
                <span className="text-muted-foreground">{dataHora(quando)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Item({
  rotulo,
  valor,
  grave = false,
}: {
  rotulo: string;
  valor: string | number;
  grave?: boolean;
}) {
  return (
    <div className={cn("rounded-lg bg-muted/50 p-2.5", grave && "bg-destructive/10")}>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className={cn("font-semibold tabular-nums", grave && "text-destructive")}>{valor}</dd>
    </div>
  );
}
