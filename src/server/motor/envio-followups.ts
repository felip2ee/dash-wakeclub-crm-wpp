/**
 * Envio dos follow-ups aprovados por humano (spec fases 2-3 §9). Um por rodada: só na
 * janela das 8h às 19h59 de São Paulo e respeitando o intervalo do modo de ritmo desde o
 * último `enviado`. A reivindicação (`enviando`) é commitada antes de chamar a Evolution,
 * e o envio roda fora de transação: se o registro depois do envio falhar, o follow-up fica
 * `enviando` e vira órfão, que é abortado com aviso ao vendedor, nunca reenviado sozinho.
 */
import { telefone } from "../../lib/formato";
import { comTransacao, getPoolMotor, type PoolClient } from "../db";
import type { AdaptadorEvolution } from "../evolution/tipos";
import { logErro } from "../log";
import { registrarMensagem } from "./ingestao";
import { dentroDaJanela, lerRitmo, MODOS } from "./ritmo";

const MAX_TENTATIVAS = 3;

const ORFAO = "envio sem confirmação";

// Título do aviso ao dono por motivo. Órfão pode ter saído: o vendedor confere antes.
const TITULO_AVISO: Record<string, string> = {
  [ORFAO]: "Follow-up sem confirmação",
  "falha no envio": "Follow-up não saiu",
  "sem texto": "Follow-up sem texto",
};

/** Aborta o follow-up que está em `statusAntes`, grava `followup_aborted` e avisa o dono. */
async function abortar(db: PoolClient, id: string, motivo: string, statusAntes: string) {
  const { rows } = await db.query<{
    atendente_id: string | null;
    nome: string | null;
    tel: string;
  }>(
    `with ab as (
       update wakeclub.followups f
          set status = 'abortado', motivo_cancelamento = $2::text
        where f.id = $1::uuid and f.status = $3::text
       returning f.id, f.lead_id, f.tentativas_envio, f.erro_envio
     ),
     ev as (
       insert into wakeclub.eventos_automacao
         (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
          estado_anterior, estado_novo, metadados,
          entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id)
       select ab.lead_id, 'sistema', 'followup_aborted', 'schedule', 'envio abortado', $2::text,
              jsonb_build_object('status', $3::text), jsonb_build_object('status', 'abortado'),
              jsonb_build_object('tentativas_envio', ab.tentativas_envio,
                                 'erro_envio', ab.erro_envio),
              'followup', ab.id, 'motor', ab.id::text, 'motor:env:' || ab.id::text
         from ab
       on conflict do nothing
     )
     select l.atendente_id, l.nome, l.telefone as tel
       from ab join wakeclub.leads l on l.id = ab.lead_id`,
    [id, motivo, statusAntes],
  );
  const lead = rows[0];
  if (!lead) return;
  await db.query(
    `insert into wakeclub.notificacoes (usuario_id, tipo, titulo, corpo, url)
     values ($1::uuid, 'aviso', $2::text, $3::text, $4::text)`,
    [
      lead.atendente_id,
      `${TITULO_AVISO[motivo]}: ${lead.nome?.trim() || telefone(lead.tel)}`,
      motivo === ORFAO ? "Envio sem confirmação: confira a conversa antes de reenviar." : motivo,
      lead.atendente_id ? "/meus-leads" : "/",
    ],
  );
}

type Reivindicado = {
  id: string;
  texto_enviado: string | null;
  aprovado_por: string;
  telefone: string;
};

/** Devolve quantos follow-ups saíram nesta rodada (0 ou 1). */
export async function tarefaEnvioFollowups(deps: {
  adaptador: AdaptadorEvolution;
  agora?: () => Date;
}): Promise<number> {
  const agora = deps.agora ?? (() => new Date());

  // Sem confirmação há 15 min: o envio pode ter saído; reenviar arriscaria duplicar.
  await comTransacao(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `select id from wakeclub.followups
        where status = 'enviando' and atualizado_em < now() - interval '15 minutes'
        for update skip locked`,
    );
    for (const r of rows) await abortar(c, r.id, ORFAO, "enviando");
  });

  if (!dentroDaJanela(agora())) return 0;

  const db = getPoolMotor();
  const { modo } = await lerRitmo(db);
  const { rows: intervalo } = await db.query<{ cedo: boolean }>(
    `select coalesce(max(enviado_em) > now() - make_interval(secs => $1::int), false) as cedo
       from wakeclub.followups where status = 'enviado'`,
    [MODOS[modo].intervaloSegundos],
  );
  if (intervalo[0].cedo) return 0;

  const f = await comTransacao(async (c) => {
    const { rows } = await c.query<Reivindicado>(
      `with alvo as (
         select f.id
           from wakeclub.followups f
           join wakeclub.leads l on l.id = f.lead_id
          where f.status = 'aprovado' and f.aprovado_por is not null
            and l.opt_out = false and l.sem_atendimento = false
          order by f.aprovado_em, f.id
          limit 1
          for update of f skip locked
       )
       update wakeclub.followups f
          set status = 'enviando'
         from alvo a, wakeclub.leads l
        where f.id = a.id and l.id = f.lead_id
       returning f.id, f.texto_enviado, f.aprovado_por, l.telefone`,
    );
    const r = rows[0];
    if (r && !r.texto_enviado?.trim()) {
      await abortar(c, r.id, "sem texto", "enviando");
      return null;
    }
    return r ?? null;
  });
  if (!f?.texto_enviado) return 0;
  const texto = f.texto_enviado;

  let evolutionMsgId: string;
  try {
    ({ evolutionMsgId } = await deps.adaptador.enviar({
      telefone: f.telefone,
      tipo: "texto",
      texto,
    }));
  } catch (erro) {
    logErro("envio-followups.falha", erro, { followupId: f.id });
    await comTransacao(async (c) => {
      const { rows } = await c.query<{ tentativas_envio: number }>(
        `update wakeclub.followups
            set tentativas_envio = tentativas_envio + 1,
                erro_envio = left($2::text, 500),
                status = case when tentativas_envio + 1 >= $3::int then status else 'aprovado' end
          where id = $1::uuid and status = 'enviando'
        returning tentativas_envio`,
        [f.id, erro instanceof Error ? erro.message : String(erro), MAX_TENTATIVAS],
      );
      if ((rows[0]?.tentativas_envio ?? 0) >= MAX_TENTATIVAS) {
        await abortar(c, f.id, "falha no envio", "enviando");
      }
    });
    return 0;
  }

  await comTransacao(async (c) => {
    await registrarMensagem(
      c,
      {
        tipo: "mensagem",
        telefone: f.telefone,
        nome: null,
        daEquipe: true,
        texto,
        tipoMidia: "texto",
        enviadaEm: new Date().toISOString(),
        evolutionMsgId,
      },
      { usuarioId: f.aprovado_por, followupId: f.id },
    );
    const { rows } = await c.query<{ n: number }>(
      `with enviado as (
         update wakeclub.followups
            set status = 'enviado', enviado_em = now()
          where id = $1::uuid and status = 'enviando'
         returning id, lead_id, tentativas_envio
       ),
       toque as (
         update wakeclub.leads l
            set n_toques = l.n_toques + 1
           from enviado e
          where l.id = e.lead_id
         returning l.n_toques
       ),
       ev as (
         insert into wakeclub.eventos_automacao
           (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
            estado_anterior, estado_novo, metadados,
            entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id)
         select e.lead_id, 'sistema', 'followup_sent', 'schedule', 'follow-up enviado',
                'aprovado por humano e enviado pelo motor',
                jsonb_build_object('status', 'enviando'),
                jsonb_build_object('status', 'enviado', 'enviado_em', now(),
                                   'n_toques', (select n_toques from toque)),
                jsonb_build_object('usuario_id', $2::uuid, 'evolution_msg_id', $3::text,
                                   'tentativas_envio', e.tentativas_envio),
                'followup', e.id, 'motor', e.id::text, 'motor:env:' || e.id::text
           from enviado e
         on conflict do nothing
       )
       select count(*)::int as n from enviado`,
      [f.id, f.aprovado_por, evolutionMsgId],
    );
    // A mensagem saiu, mas o follow-up já não estava `enviando` (abortado como órfão).
    if (rows[0].n === 0) {
      logErro("envio.sem_linha", new Error("follow-up saiu de enviando"), { followupId: f.id });
    }
  });
  return 1;
}
