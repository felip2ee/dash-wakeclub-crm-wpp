// Expõe à atendente somente os leads atribuídos a ela e suas respectivas mensagens.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAtendente } from "./auth";
import { getPool } from "./db";

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
};

export type MensagemDoMeuLead = {
  id: string;
  direcao: "lead" | "equipe" | "ia";
  texto: string | null;
  enviadaEm: string;
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
};

type LinhaMensagem = {
  id: string;
  direcao: MensagemDoMeuLead["direcao"];
  texto: string | null;
  enviada_em: Date;
};

export const listarMeusLeads = createServerFn({ method: "GET" }).handler(
  async (): Promise<MeuLead[]> => {
    const sessao = await exigirAtendente();
    const { rows } = await getPool().query<LinhaLead>(
      `select id, nome, telefone, etiqueta, etiqueta_ordem, temperatura, resumo,
              ultima_msg_em, aguardando_equipe, horas_esperando
         from wakeclub.v_leads_painel
        where atendente_id = $1::uuid
        order by etiqueta_ordem, ultima_msg_em desc nulls last`,
      [sessao.usuarioId],
    );

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
    }));
  },
);

export const listarMensagensDoMeuLead = createServerFn({ method: "GET" })
  .validator(z.object({ leadId: z.string().uuid() }))
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

    const { rows } = await getPool().query<LinhaMensagem>(
      `select id, direcao, texto, enviada_em
         from wakeclub.v_mensagens_painel
        where lead_id = $1::uuid
        order by enviada_em asc, criado_em asc`,
      [data.leadId],
    );

    return rows.map((linha) => ({
      id: linha.id,
      direcao: linha.direcao,
      texto: linha.texto,
      enviadaEm: linha.enviada_em.toISOString(),
    }));
  });
