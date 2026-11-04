import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Bot,
  Coins,
  Gauge,
  Layers,
  Link2,
  MessageSquareText,
  Monitor,
  Tag,
  Users,
} from "lucide-react";

import { PainelIa } from "@/features/admin/PainelIa";
import { CHAVE_RITMO } from "@/features/admin/Ritmo";
import { FilaEventos, useMonitorFila } from "@/features/configuracoes/FilaEventos";
import { ListaCelular, type SecaoCelular } from "@/features/configuracoes/ListaCelular";
import { ModoFollowup } from "@/features/configuracoes/ModoFollowup";
import { CHAVE_CONFIGURACOES, PrecoHora } from "@/features/configuracoes/PrecoHora";
import { RespostasRapidasCartao } from "@/features/configuracoes/RespostasRapidasCartao";
import { Secao } from "@/features/configuracoes/Secao";
import { StatusWhatsapp, useSaudeNumero } from "@/features/configuracoes/StatusWhatsapp";
import { TamanhoInterface } from "@/features/configuracoes/TamanhoInterface";
import { TemaEModo } from "@/features/configuracoes/TemaEModo";
import { DistribuicaoLeads, usePainelAdmin, Usuarios } from "@/features/configuracoes/Usuarios";
import { totalPesoAtivo } from "@/features/configuracoes/peso";
import { VendasNaoConciliadas } from "@/features/configuracoes/VendasNaoConciliadas";
import { moeda, plural } from "@/lib/formato";
import { getRitmo } from "@/server/admin-ia";
import { exigirAdmin } from "@/server/auth";
import { getConfiguracoes } from "@/server/configuracoes";

export const Route = createFileRoute("/configuracoes")({
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({ meta: [{ title: "Configurações — Wake Club" }] }),
  component: ConfiguracoesPage,
});

function SecaoIa() {
  return (
    <Secao
      id="ia"
      icone={Bot}
      titulo="Painel da IA"
      subtitulo="Configuração, filas e última execução das tarefas automáticas."
    >
      <PainelIa />
    </Secao>
  );
}

// Configurações e operação (referência 02). Desktop: cartões na ordem da imagem.
// Celular: lista de cartões (referência 05) que abre cada seção.
function ConfiguracoesPage() {
  const { sessao } = Route.useRouteContext();
  const secoes = useSecoesCelular();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6 md:px-6">
      <header>
        <h1 className="font-display text-3xl font-bold">
          <span className="md:hidden">Configurações</span>
          <span className="hidden md:inline">Configurações e operação</span>
        </h1>
        <p className="text-muted-foreground">
          Gerencie usuários, regras de distribuição, follow-up, integrações e operações do CRM
        </p>
      </header>

      <div className="md:hidden">
        <ListaCelular nome={sessao.nome} secoes={secoes} />
      </div>

      <div className="hidden space-y-4 md:block">
        <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
          <TamanhoInterface />
          <TemaEModo />
        </div>
        <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
          <Usuarios />
          <ModoFollowup />
        </div>
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          <DistribuicaoLeads />
          <PrecoHora />
          <StatusWhatsapp />
          <FilaEventos />
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <RespostasRapidasCartao />
          <SecaoIa />
        </div>
        <VendasNaoConciliadas />
      </div>
    </div>
  );
}

// Resumos da lista do celular, lidos dos mesmos caches dos cartões.
function useSecoesCelular(): SecaoCelular[] {
  const painel = usePainelAdmin();
  const ritmo = useQuery({ queryKey: CHAVE_RITMO, queryFn: () => getRitmo() });
  const config = useQuery({ queryKey: CHAVE_CONFIGURACOES, queryFn: () => getConfiguracoes() });
  const saude = useSaudeNumero();
  const fila = useMonitorFila();
  const ativos = painel.data?.atendentes.filter((a) => a.ativo).length;

  return [
    {
      id: "usuarios",
      titulo: "Time",
      icone: Users,
      resumo: ativos === undefined ? "…" : plural(ativos, "vendedor ativo", "vendedores ativos"),
      conteudo: <Usuarios />,
    },
    {
      id: "distribuicao",
      titulo: "Distribuição de leads",
      icone: Coins,
      resumo: painel.data ? `Total de peso ativo: ${totalPesoAtivo(painel.data.atendentes)}` : "…",
      conteudo: <DistribuicaoLeads />,
    },
    {
      id: "modo-followup",
      titulo: "Modo de follow-up",
      icone: Gauge,
      resumo: ritmo.data ? (ritmo.data.modo === "aquecido" ? "Aquecido" : "Conservador") : "…",
      conteudo: <ModoFollowup />,
    },
    {
      id: "preco-hora",
      titulo: "Preço por hora",
      icone: Tag,
      resumo: config.data ? moeda(config.data.precoHora) : "…",
      conteudo: <PrecoHora />,
    },
    {
      id: "whatsapp",
      titulo: "WhatsApp",
      icone: Activity,
      resumo: saude.isPending
        ? "…"
        : !saude.data
          ? "Sem dados de conexão"
          : saude.data.alerta === "ok"
            ? "Conectado e operando"
            : `Atenção: ${saude.data.alerta}`,
      conteudo: <StatusWhatsapp />,
    },
    {
      id: "fila",
      titulo: "Fila de eventos",
      icone: Layers,
      resumo: fila.data ? `${fila.data.pendentes} pendentes · ${fila.data.falhos} falhos` : "…",
      conteudo: <FilaEventos />,
    },
    {
      id: "vendas-nao-conciliadas",
      titulo: "Vendas sem responsável",
      icone: Link2,
      resumo: "Nenhuma venda recebida ainda",
      conteudo: <VendasNaoConciliadas />,
    },
    {
      id: "respostas-rapidas",
      titulo: "Respostas rápidas",
      icone: MessageSquareText,
      resumo: "Textos prontos da conversa",
      conteudo: <RespostasRapidasCartao />,
    },
    {
      id: "ia",
      titulo: "Painel da IA",
      icone: Bot,
      resumo: "Filas e tarefas automáticas",
      conteudo: <SecaoIa />,
    },
    {
      id: "tamanho",
      titulo: "Tamanho e tema",
      icone: Monitor,
      resumo: "Neste navegador",
      conteudo: (
        <div className="space-y-4">
          <TamanhoInterface />
          <TemaEModo />
        </div>
      ),
    },
  ];
}
