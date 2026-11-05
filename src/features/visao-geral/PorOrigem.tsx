import { Megaphone } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { moeda } from "@/lib/formato";
import type { OrigemLinha, ResumoComercial } from "@/server/comercial";

const CANAL: Record<OrigemLinha["canal"], string> = {
  anuncio: "Anúncio",
  link: "Link",
  busca: "Busca",
  outro: "Outro",
  direto: "Direto",
};
const APP: Record<NonNullable<OrigemLinha["app"]>, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
};

const rotulo = (o: OrigemLinha) => (o.app ? `${CANAL[o.canal]} · ${APP[o.app]}` : CANAL[o.canal]);

type Linha = {
  chave: string;
  nome: string;
  leadsNovos: number;
  compraram: number;
  conversaoPct: number;
  faturamento: number;
};

function Tabela({ titulo, linhas }: { titulo: string; linhas: Linha[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[30rem] text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="py-2 font-medium">
              {titulo}
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Leads novos
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Compraram
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Conversão
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Faturamento
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave} className="border-b border-border">
              <th scope="row" className="py-2 text-left font-normal">
                {l.nome}
              </th>
              <td className="py-2 text-right tabular-nums">{l.leadsNovos}</td>
              <td className="py-2 text-right tabular-nums">{l.compraram}</td>
              <td className="py-2 text-right tabular-nums">{l.conversaoPct}%</td>
              <td className="py-2 text-right tabular-nums">{moeda(l.faturamento)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// De onde vieram os leads novos do período e quanto deles virou venda (spec §4.3).
export function PorOrigem({ comercial }: { comercial: ResumoComercial | undefined }) {
  const vazio = comercial?.leadsNovos.atual === 0;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="flex items-start gap-3">
        <Megaphone aria-hidden className="mt-0.5 h-6 w-6 shrink-0" />
        <div>
          <h2 className="font-display text-lg font-semibold">Por origem</h2>
          <p className="text-sm text-muted-foreground">
            Leads novos do período e quantos compraram
          </p>
        </div>
      </header>
      <div className="mt-3 space-y-4">
        {!comercial && <Skeleton className="h-40 rounded-lg" />}
        {vazio && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum lead novo no período.
          </p>
        )}
        {comercial && !vazio && (
          <>
            <Tabela
              titulo="Origem"
              linhas={comercial.porOrigem.map((o) => ({
                ...o,
                chave: `${o.canal}-${o.app ?? ""}`,
                nome: rotulo(o),
              }))}
            />
            {comercial.anuncios.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">Por anúncio</h3>
                <Tabela
                  titulo="Anúncio"
                  linhas={comercial.anuncios.map((a, i) => ({
                    ...a,
                    chave: a.anuncioId ?? `sem-id-${i}`,
                    nome: a.titulo ?? a.anuncioId ?? "Anúncio sem identificação",
                  }))}
                />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
