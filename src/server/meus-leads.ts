// Expõe à atendente somente os leads atribuídos a ela e suas respectivas mensagens.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAtendente } from "./auth";
import {
  type Autoria,
  autoria,
  LIMITE_MENSAGENS,
  leadsComSugestao,
  lerMensagens,
} from "./conversas";
import { getPool, getPoolMotor } from "./db";

export type MeuLead = {
  id: string;
  nome: string | null;
  telefone: string;
  etiqueta: string;
  etiquetaOrdem: number;
  temperatura: "quente" | "morno" | "frio" | null;
  resumo: string | null;
  ultimaMsgEm: string | null;
  aguardandoEquipe: boolean;
  horasEsperando: number | null;
  ultimaTexto: string | null;
  msgsLeadSemResposta: number;
  /** Há follow-up `aguardando_aprovacao` (sugestão da IA esperando a atendente). */
  followupAguardando: boolean;
};

export type MensagemDoMeuLead = {
  id: string;
  direcao: "lead" | "equipe" | "ia";
  texto: string | null;
  enviadaEm: string;
  /** 0 erro · 1 pendente · 2 servidor · 3 entregue · 4 lido · 5 reproduzido */
  entregaNivel: number | null;
  autoria: Autoria;
};

type LinhaLead = {
  id: string;
  nome: string | null;
  telefone: string;
  etiqueta: string;
  etiqueta_ordem: number;
  temperatura: MeuLead["temperatura"];
  resumo: string | null;
  ultima_msg_em: Date | null;
  aguardando_equipe: boolean;
  horas_esperando: number | null;
  ultima_texto: string | null;
  msgs_lead_sem_resposta: number | null;
};

export const listarMeusLeads = createServerFn({ method: "GET" }).handler(
  async (): Promise<MeuLead[]> => {
    const sessao = await exigirAtendente();
    // A última mensagem e o contador vêm da view da caixa de entrada (a mesma de `/`).
    const [{ rows }, sugestoes] = await Promise.all([
      getPool().query<LinhaLead>(
        `select l.id, l.nome, l.telefone, l.etiqueta, l.etiqueta_ordem, l.temperatura,
                l.resumo, l.ultima_msg_em, l.aguardando_equipe, l.horas_esperando,
                c.ultima_texto, c.msgs_lead_sem_resposta
           from wakeclub.v_leads_painel l
           left join wakeclub.v_conversas_painel c on c.id = l.id
          where l.atendente_id = $1::uuid
          order by l.ultima_msg_em desc nulls last`,
        [sessao.usuarioId],
      ),
      leadsComSugestao(getPoolMotor(), sessao.usuarioId),
    ]);

    return rows.map((linha) => ({
      id: linha.id,
      nome: linha.nome,
      telefone: linha.telefone,
      etiqueta: linha.etiqueta,
      etiquetaOrdem: Number(linha.etiqueta_ordem),
      temperatura: linha.temperatura,
      resumo: linha.resumo,
      ultimaMsgEm: linha.ultima_msg_em?.toISOString() ?? null,
      aguardandoEquipe: linha.aguardando_equipe,
      horasEsperando: linha.horas_esperando === null ? null : Number(linha.horas_esperando),
      ultimaTexto: linha.ultima_texto,
      msgsLeadSemResposta: Number(linha.msgs_lead_sem_resposta ?? 0),
      followupAguardando: sugestoes.has(linha.id),
    }));
  },
);

export const listarMensagensDoMeuLead = createServerFn({ method: "GET" })
  .validator(z.object({ leadId: z.string().uuid(), limite: LIMITE_MENSAGENS }))
  .handler(async ({ data }): Promise<MensagemDoMeuLead[]> => {
    const sessao = await exigirAtendente();
    const pertence = await getPool().query<{ existe: boolean }>(
      `select exists (
         select 1
           from wakeclub.v_leads_painel
          where id = $1::uuid
            and atendente_id = $2::uuid
       ) as existe`,
      [data.leadId, sessao.usuarioId],
    );

    if (!pertence.rows[0]?.existe) throw new Error("Lead não encontrado.");

    const rows = await lerMensagens(getPool(), data.leadId, data.limite ?? null);

    return rows.map((linha) => ({
      id: linha.id,
      direcao: linha.direcao,
      texto: linha.texto,
      enviadaEm: linha.enviada_em.toISOString(),
      entregaNivel: linha.entrega_nivel,
      autoria: autoria(linha.enviada_por, linha.autor_nome),
    }));
  });
