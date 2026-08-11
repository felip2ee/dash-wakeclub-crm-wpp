/**
 * Contexto unificado da oportunidade para o workspace do Kanban.
 *
 * Mantém a montagem no servidor, valida o admin uma vez e consulta somente o
 * lead solicitado. Continua sendo um espelho: nenhuma escrita acontece aqui.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAdmin } from "./auth";
import { getMensagens, type Mensagem } from "./conversas";
import { getFollowups, getWf02Atividade, type Followup, type QualificacaoIA } from "./wf02";

export type FiltroTimeline = "todos" | "mensagens" | "ia" | "followups" | "equipe";
type CategoriaTimeline = Exclude<FiltroTimeline, "todos">;

type EventoBase = {
  id: string;
  ocorridoEm: string;
  categorias: CategoriaTimeline[];
};

export type EventoTimeline =
  | (EventoBase & { tipo: "mensagem"; mensagem: Mensagem })
  | (EventoBase & { tipo: "decisao_ia"; qualificacao: QualificacaoIA })
  | (EventoBase & {
      tipo: "followup_criado" | "followup_cancelado" | "followup_enviado";
      followup: Followup;
    });

export function montarTimeline({
  mensagens,
  qualificacoes,
  followups,
}: {
  mensagens: Mensagem[];
  qualificacoes: QualificacaoIA[];
  followups: Followup[];
}): EventoTimeline[] {
  const eventos: EventoTimeline[] = mensagens.map((mensagem) => ({
    id: `mensagem-${mensagem.id}`,
    tipo: "mensagem",
    ocorridoEm: mensagem.enviadaEm,
    categorias:
      mensagem.direcao === "ia"
        ? ["mensagens", "ia"]
        : mensagem.direcao === "equipe"
          ? ["mensagens", "equipe"]
          : ["mensagens"],
    mensagem,
  }));

  for (const qualificacao of qualificacoes) {
    eventos.push({
      id: `ia-${qualificacao.id}`,
      tipo: "decisao_ia",
      ocorridoEm: qualificacao.qualificadoEm,
      categorias: ["ia"],
      qualificacao,
    });
  }

  for (const followup of followups) {
    eventos.push({
      id: `followup-criado-${followup.id}`,
      tipo: "followup_criado",
      ocorridoEm: followup.criadoEm,
      categorias: ["followups"],
      followup,
    });

    if (followup.enviadoEm || followup.status === "enviado") {
      eventos.push({
        id: `followup-enviado-${followup.id}`,
        tipo: "followup_enviado",
        ocorridoEm: followup.enviadoEm ?? followup.atualizadoEm,
        categorias: ["followups"],
        followup,
      });
    } else if (["cancelado", "abortado"].includes(followup.status)) {
      eventos.push({
        id: `followup-cancelado-${followup.id}`,
        tipo: "followup_cancelado",
        ocorridoEm: followup.atualizadoEm,
        categorias: ["followups"],
        followup,
      });
    }
  }

  return eventos.sort((a, b) => Date.parse(b.ocorridoEm) - Date.parse(a.ocorridoEm));
}

export const getOpportunityWorkspace = createServerFn({ method: "GET" })
  .validator(z.object({ leadId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await exigirAdmin();

    // ponytail: reutiliza as leituras atuais (limitadas a 500 rastros); crie SQL
    // dedicado por lead somente quando esse teto aparecer nos dados reais.
    const [mensagens, atividade, todosFollowups] = await Promise.all([
      getMensagens({ data: { leadId: data.leadId } }),
      getWf02Atividade(),
      getFollowups(),
    ]);
    const qualificacoes = atividade.filter((item) => item.leadId === data.leadId);
    const followups = todosFollowups.filter((item) => item.leadId === data.leadId);

    return {
      mensagens,
      qualificacoes,
      followups,
      timeline: montarTimeline({ mensagens, qualificacoes, followups }),
    };
  });

export type DadosOpportunityWorkspace = Awaited<ReturnType<typeof getOpportunityWorkspace>>;
