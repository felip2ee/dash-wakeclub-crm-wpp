import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  AlarmClock,
  Bot,
  Clock,
  Info,
  MessageCircle,
  RefreshCw,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useEffect } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { dataHoraCompleta, desde, diaCurto } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { getRelatorios, type Relatorios } from "@/server/relatorios";

/**
 * Relatórios — os números reais do CRM.
 *
 * O que NÃO existe aqui, de propósito: desempenho por atendente e CSAT. A
 * Evolution espelha um número só e `mensagens.direcao` distingue apenas
 * `lead` / `equipe` / `ia` — o banco não sabe quem da equipe digitou. Um
 * ranking de atendente seria invenção, e número inventado em painel é pior
 * que número ausente.
 */

const RECARREGAR_A_CADA_MS = 60_000;

/** Ordem fixa das séries. Nunca ciclar: cor segue a entidade, não a posição. */
const SERIE = {
  lead: "var(--serie-lead)",
  equipe: "var(--serie-equipe)",
  ia: "var(--serie-ia)",
} as const;

const EIXO = { fill: "var(--color-muted-foreground)", fontSize: 11 };

const TOOLTIP = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  fontSize: 12,
};

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Relatórios — Wake Club CRM" },
      {
        name: "description",
        content: "Funil, volume de conversas e atividade da IA no CRM da Wake Club.",
      },
    ],
  }),
  loader: (): Promise<Relatorios> => getRelatorios(),
  errorComponent: ErroDeConexao,
  component: ReportsPage,
});

function ReportsPage() {
  const { resumo, funil, volume, atividade } = Route.useLoaderData();
  const router = useRouter();

  useEffect(() => {
    const t = setInterval(() => void router.invalidate(), RECARREGAR_A_CADA_MS);
    return () => clearInterval(t);
  }, [router]);

  const funilComDados = funil.map((f) => ({ ...f, etiquetaCurta: f.etiqueta }));
  const volumeComDia = volume.map((v) => ({ ...v, rotulo: diaCurto(v.dia) }));
  const atividadeComDia = atividade.map((a) => ({ ...a, rotulo: diaCurto(a.dia) }));

  const temMensagem = resumo.mensagensTotal > 0;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4 sm:pb-6">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            Relatórios
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm" suppressHydrationWarning>
            {resumo.ultimaMensagemEm
              ? `última mensagem ${desde(resumo.ultimaMensagemEm)}`
              : "nenhuma mensagem no banco"}
          </p>
        </div>
        <Badge
          variant="outline"
          className="shrink-0 gap-1.5 rounded-full px-3 font-normal text-muted-foreground"
        >
          <RefreshCw className="h-3 w-3" /> atualiza sozinho
        </Badge>
      </div>

      {!temMensagem && (
        <div className="mb-4 flex gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs leading-relaxed">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <strong>Não há mensagem nenhuma no banco.</strong> Os gráficos abaixo estão corretos —
            só não têm o que mostrar. Isso normalmente significa que o WF-01 parou de receber
            webhook da Evolution. Rode <code className="font-mono">bun run db:check</code> para ver
            a contagem real de cada tabela.
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KPI
          icon={Users}
          label="Leads no CRM"
          valor={resumo.totalLeads}
          detalhe={`${resumo.leadsAtivos7d} ativos nos últimos 7 dias`}
          tom="primary"
        />
        <KPI
          icon={Clock}
          label="Aguardando a equipe"
          valor={resumo.aguardandoEquipe}
          detalhe={
            resumo.mediaHorasEspera !== null
              ? `média de ${resumo.mediaHorasEspera}h de espera`
              : "ninguém esperando"
          }
          tom={resumo.aguardandoEquipe > 0 ? "warning" : "success"}
        />
        <KPI
          icon={Bot}
          label="Qualificações da IA"
          valor={resumo.qualificacoesTotal}
          detalhe={
            resumo.qualificacoesTotal === 0
              ? "o WF-02 ainda não rodou"
              : `${resumo.qualificacoes24h} nas últimas 24h`
          }
          tom="info"
        />
        <KPI
          icon={AlarmClock}
          label="Followups pendentes"
          valor={resumo.followupsPendentes}
          detalhe={
            resumo.followupsVencidos > 0
              ? `${resumo.followupsVencidos} já vencidos`
              : `${resumo.followupsTotal} criados no total`
          }
          tom={resumo.followupsVencidos > 0 ? "warning" : "primary"}
        />
      </div>

      {/* ----------------------------------------------------------- funil */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-3">
        <Painel
          className="xl:col-span-2"
          titulo="Funil de leads"
          subtitulo="Quantos leads em cada etapa do playbook (§24)"
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={funilComDados}
                layout="vertical"
                margin={{ top: 4, right: 40, left: 0, bottom: 4 }}
                barCategoryGap={6}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={EIXO}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="etiquetaCurta"
                  tickLine={false}
                  axisLine={false}
                  tick={EIXO}
                  width={140}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
                  contentStyle={TOOLTIP}
                  formatter={(v: number) => [v, "leads"]}
                />
                {/* Série única: a cor não codifica nada, então não há legenda.
                    O rótulo direto na ponta dispensa ler o eixo. */}
                <Bar dataKey="total" fill={SERIE.equipe} radius={[0, 4, 4, 0]} maxBarSize={22}>
                  <LabelList
                    dataKey="total"
                    position="right"
                    fill="var(--color-muted-foreground)"
                    fontSize={11}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Painel>

        {/* Temperatura é ESTADO, não série: vai como tiles com rótulo, nunca
            empilhada dentro da barra do funil (ficaria ilegível e a paleta de
            4 fatias não passa nos checks de contraste). */}
        <Painel titulo="Temperatura dos leads" subtitulo="Leitura da IA sobre quão perto de fechar">
          <div className="space-y-2">
            <Termometro
              rotulo="Quente"
              valor={somar(funil, "quente")}
              total={resumo.totalLeads}
              classe="border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
            />
            <Termometro
              rotulo="Morno"
              valor={somar(funil, "morno")}
              total={resumo.totalLeads}
              classe="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            />
            <Termometro
              rotulo="Frio"
              valor={somar(funil, "frio")}
              total={resumo.totalLeads}
              classe="border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
            />
            <Termometro
              rotulo="Sem classificação"
              valor={somar(funil, "semTemperatura")}
              total={resumo.totalLeads}
              classe="border-border bg-muted text-muted-foreground"
            />
          </div>

          <div className="mt-3 flex gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              "Sem classificação" são leads que a IA nunca olhou.{" "}
              <Link to="/wf02" className="text-primary hover:underline">
                A aba do WF-02
              </Link>{" "}
              mostra por quê.
            </span>
          </div>
        </Painel>
      </div>

      {/* ---------------------------------------------------------- volume */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-2">
        <Painel
          titulo="Volume de conversa"
          subtitulo="Mensagens por dia, últimos 30 dias"
          legenda={
            <>
              <PontoLegenda cor={SERIE.lead} rotulo="Do lead" />
              <PontoLegenda cor={SERIE.equipe} rotulo="Da equipe" />
              <PontoLegenda cor={SERIE.ia} rotulo="Da IA" />
            </>
          }
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={volumeComDia} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gLead" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIE.lead} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={SERIE.lead} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gEquipe" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIE.equipe} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={SERIE.equipe} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="rotulo"
                  tickLine={false}
                  axisLine={false}
                  tick={EIXO}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis tickLine={false} axisLine={false} tick={EIXO} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP} />
                <Area
                  type="monotone"
                  dataKey="doLead"
                  name="Do lead"
                  stroke={SERIE.lead}
                  strokeWidth={2}
                  fill="url(#gLead)"
                />
                <Area
                  type="monotone"
                  dataKey="daEquipe"
                  name="Da equipe"
                  stroke={SERIE.equipe}
                  strokeWidth={2}
                  fill="url(#gEquipe)"
                />
                <Area
                  type="monotone"
                  dataKey="daIa"
                  name="Da IA"
                  stroke={SERIE.ia}
                  strokeWidth={2}
                  fill="none"
                  strokeDasharray="4 3"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            "Da IA" só sai do zero quando o WF-03 (motor de followup) estiver ligado — hoje a IA lê
            e classifica, mas não envia nada.
          </p>
        </Painel>

        <Painel
          titulo="Atividade da IA"
          subtitulo="O que o WF-02 fez por dia, últimos 30 dias"
          legenda={
            <>
              <PontoLegenda cor={SERIE.lead} rotulo="Qualificações" />
              <PontoLegenda cor={SERIE.equipe} rotulo="Followups criados" />
              <PontoLegenda cor={SERIE.ia} rotulo="Cancelados" />
            </>
          }
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={atividadeComDia} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="rotulo"
                  tickLine={false}
                  axisLine={false}
                  tick={EIXO}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis tickLine={false} axisLine={false} tick={EIXO} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP} />
                <Line
                  type="monotone"
                  dataKey="qualificacoes"
                  name="Qualificações"
                  stroke={SERIE.lead}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="followupsCriados"
                  name="Followups criados"
                  stroke={SERIE.equipe}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="followupsCancelados"
                  name="Cancelados"
                  stroke={SERIE.ia}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p
            className="mt-2 text-[11px] leading-relaxed text-muted-foreground"
            suppressHydrationWarning
          >
            {resumo.ultimaQualificacaoEm
              ? `Última qualificação em ${dataHoraCompleta(resumo.ultimaQualificacaoEm)}.`
              : "A IA nunca qualificou ninguém neste banco."}{" "}
            Cancelado significa que a conversa andou e a IA descartou o toque — é comportamento
            correto, não erro.
          </p>
        </Painel>
      </div>

      {/* ------------------------------------------------------- tabelinha */}
      <Painel
        className="mt-4"
        titulo="Números exatos"
        subtitulo="Os mesmos dados dos gráficos, em texto"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <tbody className="divide-y divide-border">
              <Linha rotulo="Leads no CRM" valor={resumo.totalLeads} />
              <Linha rotulo="Ativos nos últimos 7 dias" valor={resumo.leadsAtivos7d} />
              <Linha rotulo="Que pediram opt-out" valor={resumo.leadsOptOut} />
              <Linha rotulo="Aguardando resposta da equipe" valor={resumo.aguardandoEquipe} />
              <Linha rotulo="Mensagens registradas" valor={resumo.mensagensTotal} />
              <Linha rotulo="Mensagens nas últimas 24h" valor={resumo.mensagens24h} />
              <Linha rotulo="Leads que a IA já qualificou" valor={resumo.leadsQualificados} />
              <Linha rotulo="Qualificações no total" valor={resumo.qualificacoesTotal} />
              <Linha rotulo="Leads na fila de qualificação" valor={resumo.filaQualificacao} />
              <Linha rotulo="Followups criados" valor={resumo.followupsTotal} />
              <Linha rotulo="Followups pendentes" valor={resumo.followupsPendentes} />
              <Linha rotulo="Followups enviados" valor={resumo.followupsEnviados} />
              <Linha rotulo="Followups cancelados" valor={resumo.followupsCancelados} />
              <Linha rotulo="Followups abortados pelo Porteiro" valor={resumo.followupsAbortados} />
            </tbody>
          </table>
        </div>
      </Painel>
    </div>
  );
}

// ---------------------------------------------------------------- peças

function somar(funil: Relatorios["funil"], campo: "quente" | "morno" | "frio" | "semTemperatura") {
  return funil.reduce((t, f) => t + f[campo], 0);
}

function Painel({
  titulo,
  subtitulo,
  legenda,
  className,
  children,
}: {
  titulo: string;
  subtitulo: string;
  legenda?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 pb-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold">{titulo}</h2>
          <p className="text-xs text-muted-foreground">{subtitulo}</p>
        </div>
        {legenda && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">{legenda}</div>
        )}
      </div>
      {children}
    </section>
  );
}

function PontoLegenda({ cor, rotulo }: { cor: string; rotulo: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />
      {rotulo}
    </span>
  );
}

function KPI({
  icon: Icon,
  label,
  valor,
  detalhe,
  tom,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  valor: number;
  detalhe: string;
  tom: "primary" | "info" | "success" | "warning";
}) {
  const tons = {
    primary: "bg-primary/10 text-primary",
    info: "bg-info/10 text-info",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning-foreground",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className={cn("grid h-10 w-10 place-items-center rounded-xl", tons[tom])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3 font-display text-3xl font-semibold tracking-tight">
        {valor.toLocaleString("pt-BR")}
      </div>
      <div className="mt-0.5 text-xs font-medium">{label}</div>
      <div className="mt-1 text-[11px] leading-tight text-muted-foreground">{detalhe}</div>
    </div>
  );
}

function Termometro({
  rotulo,
  valor,
  total,
  classe,
}: {
  rotulo: string;
  valor: number;
  total: number;
  classe: string;
}) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div className={cn("rounded-xl border p-2.5", classe)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{rotulo}</span>
        <span className="font-display text-lg font-semibold">{valor}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-current/15">
        <div className="h-full rounded-full bg-current" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-[10px] opacity-75">{pct}% dos leads</div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <tr>
      <td className="py-2 pr-4 text-muted-foreground">{rotulo}</td>
      <td className="py-2 text-right font-mono font-medium tabular-nums">
        {valor.toLocaleString("pt-BR")}
      </td>
    </tr>
  );
}

function ErroDeConexao({ error }: { error: Error }) {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <MessageCircle className="mx-auto h-8 w-8 text-destructive" />
        <h2 className="mt-3 font-display text-base font-semibold">
          Não deu para montar os relatórios
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Se a mensagem fala em permissão, as views de relatório não foram liberadas para a role do
          painel. Rode <code className="font-mono">bun run db:apply</code>.
        </p>
      </div>
    </div>
  );
}
