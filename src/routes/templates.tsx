import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Plus,
  Search,
  Sparkles,
  CheckCircle2,
  Clock,
  XCircle,
  Send,
  Rocket,
  MoreVertical,
  Copy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { campaigns, templates, type Template } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { exigirAdmin } from "@/server/auth";

/**
 * Disparos — ÚNICA TELA AINDA EM DADO FALSO.
 *
 * Continua sendo apenas um template visual: disparo em massa não é
 * escopo agora, e ligar isto no banco exigiria escrita (o painel é espelho) e
 * uma chamada à Evolution. O aviso no topo existe para ninguém confundir estes
 * números com números reais.
 *
 * Quando virar de verdade, o caminho é o WF-03 no n8n, não este arquivo.
 */
export const Route = createFileRoute("/templates")({
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({
    meta: [
      { title: "Disparos (demo) — Wake Club CRM" },
      {
        name: "description",
        content: "Tela de demonstração de templates e campanhas. Não conectada ao CRM.",
      },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6 sm:py-6">
      <div className="pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            Disparos
          </h1>
          <Badge
            variant="outline"
            className="rounded-full border-amber-500/40 bg-amber-500/10 text-[10px] font-medium text-amber-700 dark:text-amber-400"
          >
            demo · dado falso
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Templates e campanhas — ainda não conectado ao CRM.
        </p>
      </div>

      <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs leading-relaxed">
        <strong>Nada nesta tela é real.</strong> Todos os números, templates e campanhas abaixo são
        de exemplo, herdados do template original do painel. Nenhum botão aqui envia mensagem. As
        demais telas do painel leem o banco de verdade.
      </div>

      <Tabs defaultValue="templates">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="templates" className="flex-1 sm:flex-none">
            Templates
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="flex-1 sm:flex-none">
            Campanhas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          <TemplatesGrid />
        </TabsContent>

        <TabsContent value="campaigns" className="mt-4">
          <CampaignsBoard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TemplatesGrid() {
  const [selected, setSelected] = useState<Template>(templates[0]);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar template pelo nome" className="h-9 pl-8" />
          </div>
          <Button variant="outline" size="sm">
            Categoria
          </Button>
          <Button variant="outline" size="sm">
            Idioma
          </Button>
          <Button size="sm" className="gap-2 ml-auto">
            <Plus className="h-4 w-4" /> Novo template
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className={cn(
                "group rounded-2xl border p-4 text-left transition-all hover:shadow-sm",
                selected.id === t.id
                  ? "border-primary/50 bg-accent/60 shadow-sm"
                  : "border-border bg-card",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {t.name}
                    </span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{t.category}</span> · <span>{t.language}</span> ·{" "}
                    <span>{t.variables} variáveis</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">{t.body}</p>
              <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>atualizado {t.updatedAt}</span>
                <span className="inline-flex items-center gap-1 text-primary">
                  <Rocket className="h-3 w-3" /> usar em campanha
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <aside className="h-fit rounded-2xl border border-border bg-card p-4 sm:p-5 lg:sticky lg:top-20">
        <div className="flex items-center justify-between pb-3">
          <div>
            <div className="text-xs text-muted-foreground">Pré-visualização</div>
            <div className="font-mono text-sm font-semibold">{selected.name}</div>
          </div>
          <StatusBadge status={selected.status} />
        </div>

        <div className="rounded-2xl bg-[radial-gradient(circle_at_10%_10%,color-mix(in_oklab,var(--color-primary)_10%,transparent),transparent_40%)] p-4">
          <div className="ml-auto max-w-[280px] rounded-2xl rounded-br-sm bg-primary p-3 text-primary-foreground shadow-sm">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {selected.body.replace(/\{\{(\d+)\}\}/g, (_, n) => `【var${n}】`)}
            </p>
            <div className="mt-1.5 text-right text-[10px] text-primary-foreground/70">agora ✓✓</div>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-xs">
          <Row label="Categoria" value={selected.category} />
          <Row label="Idioma" value={selected.language} />
          <Row label="Variáveis" value={`${selected.variables} campos dinâmicos`} />
          <Row label="Última atualização" value={selected.updatedAt} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Copy className="h-3.5 w-3.5" /> Duplicar
          </Button>
          <Button size="sm" className="gap-2">
            <Send className="h-3.5 w-3.5" /> Nova campanha
          </Button>
        </div>
      </aside>
    </div>
  );
}

function CampaignsBoard() {
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Agendadas" value="1" tone="info" />
        <StatCard label="Enviando agora" value="1" tone="warning" pulse />
        <StatCard label="Concluídas no mês" value="14" tone="success" />
        <StatCard label="Taxa média de leitura" value="82%" tone="primary" />
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="font-display text-base font-semibold">Campanhas</h3>
            <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
          </div>
          <Button size="sm" className="gap-2">
            <Sparkles className="h-4 w-4" /> Nova campanha
          </Button>
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Campanha</th>
                <th className="px-4 py-3 font-medium">Template</th>
                <th className="px-4 py-3 font-medium">Audiência</th>
                <th className="px-4 py-3 font-medium">Entrega</th>
                <th className="px-4 py-3 font-medium">Leitura</th>
                <th className="px-4 py-3 font-medium">Respostas</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.map((c) => {
                const delivered = c.sent ? Math.round((c.delivered / c.sent) * 100) : 0;
                const read = c.delivered ? Math.round((c.read / c.delivered) * 100) : 0;
                return (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">{c.scheduledFor}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {c.template}
                    </td>
                    <td className="px-4 py-3">{c.audience.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Progress value={delivered} className="h-1.5 w-24" />
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {delivered}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Progress value={read} className="h-1.5 w-24" />
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {read}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{c.replied.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3">
                      <CampaignStatus status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Template["status"] }) {
  const map = {
    APPROVED: {
      label: "Aprovado",
      icon: CheckCircle2,
      cls: "border-primary/30 bg-primary/10 text-primary",
    },
    PENDING: {
      label: "Em análise",
      icon: Clock,
      cls: "border-warning/40 bg-warning/15 text-warning-foreground",
    },
    REJECTED: {
      label: "Rejeitado",
      icon: XCircle,
      cls: "border-destructive/30 bg-destructive/10 text-destructive",
    },
  } as const;
  const s = map[status];
  return (
    <Badge
      variant="outline"
      className={cn("h-5 gap-1 rounded-full text-[10px] font-medium", s.cls)}
    >
      <s.icon className="h-3 w-3" /> {s.label}
    </Badge>
  );
}

function CampaignStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    Rascunho: "border-border bg-muted text-muted-foreground",
    Agendada: "border-info/30 bg-info/10 text-info",
    Enviando: "border-warning/40 bg-warning/15 text-warning-foreground",
    Concluída: "border-primary/30 bg-primary/10 text-primary",
  };
  return (
    <Badge variant="outline" className={cn("rounded-full text-[10px]", map[status])}>
      {status}
    </Badge>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-border py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  pulse,
}: {
  label: string;
  value: string;
  tone: "primary" | "info" | "success" | "warning";
  pulse?: boolean;
}) {
  const toneMap = {
    primary: "text-primary",
    info: "text-info",
    success: "text-success",
    warning: "text-warning-foreground",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {pulse && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
          </span>
        )}
        {label}
      </div>
      <div className={cn("mt-1 font-display text-2xl font-semibold", toneMap[tone])}>{value}</div>
    </div>
  );
}
