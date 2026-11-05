/**
 * Envio dos follow-ups aprovados por humano (spec fases 2-3 §9, pipeline §6 e §8). Um por
 * rodada, na janela 8h–19h59 de São Paulo, até a cota de envios do dia e com o intervalo do
 * modo de ritmo. A fila atravessa dias (lembretes, valor esperado, mais antigo); aprovado há
 * mais de 3 dias passa de novo pelo porteiro. `enviando` é commitado antes da Evolution; se o
 * registro depois falhar, vira órfão, abortado com aviso e nunca reenviado sozinho. Só
 * `ErroEnvio` "nao_saiu" volta a `aprovado`. Fila da Evolution atrasada segura o envio (I3):
 * sem os eventos em dia, o motor não sabe se o lead respondeu.
 */
import { telefone } from "../../lib/formato";
import { type ClienteDb, comTransacao, getPoolMotor, type PoolClient } from "../db";
import { type AdaptadorEvolution, ErroEnvio } from "../evolution/tipos";
import type { ClienteIa } from "../ia/tipos";
import { logErro, logInfo } from "../log";
import { registrarMensagem } from "./ingestao";
import { avaliarPorteiro } from "./redator";
import { dentroDaJanela, enviadosHoje, lerRitmo, MODOS } from "./ritmo";
import { valorEsperado } from "./valor";

const MAX_TENTATIVAS = 3;

const ORFAO = "envio sem confirmação";
const BARRADO = "porteiro na fila de envio: ";

// Título do aviso ao dono por motivo. Órfão pode ter saído: o vendedor confere antes.
const TITULO_AVISO: Record<string, string> = {
  [ORFAO]: "Follow-up sem confirmação",
  "falha no envio": "Follow-up não saiu",
  "sem texto": "Follow-up sem texto",
  [BARRADO]: "Follow-up barrado na fila",
};

/**
 * Aborta o follow-up que está em `statusAntes`, grava o evento e avisa o dono. Motivo que
 * começa com `BARRADO` é decisão do porteiro (`followup_blocked`); o resto, `followup_aborted`.
 */
async function abortar(db: PoolClient, id: string, motivo: string, statusAntes: string) {
  const barrado = motivo.startsWith(BARRADO);
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
       select ab.lead_id, $4::text, $5::text, 'schedule', $6::text, $2::text,
              jsonb_build_object('status', $3::text), jsonb_build_object('status', 'abortado'),
              jsonb_build_object('tentativas_envio', ab.tentativas_envio,
                                 'erro_envio', ab.erro_envio),
              'followup', ab.id, 'motor', ab.id::text, 'motor:env:' || ab.id::text
         from ab
       on conflict do nothing
     )
     select l.atendente_id, l.nome, l.telefone as tel
       from ab join wakeclub.leads l on l.id = ab.lead_id`,
    barrado
      ? [id, motivo, statusAntes, "porteiro", "followup_blocked", "barrou"]
      : [id, motivo, statusAntes, "sistema", "followup_aborted", "envio abortado"],
  );
  const lead = rows[0];
  if (!lead) return;
  await db.query(
    `insert into wakeclub.notificacoes (usuario_id, tipo, titulo, corpo, url)
     values ($1::uuid, 'aviso', $2::text, $3::text, $4::text)`,
    [
      lead.atendente_id,
      `${TITULO_AVISO[barrado ? BARRADO : motivo]}: ${lead.nome?.trim() || telefone(lead.tel)}`,
      motivo === ORFAO ? "Envio sem confirmação: confira a conversa antes de reenviar." : motivo,
      lead.atendente_id ? "/meus-leads" : "/",
    ],
  );
}

export type Candidato = { id: string; tipo: string; aprovadoEm: Date; valorEsperado: number };

export const LEMBRETES = new Set(["lembrete_d1", "lembrete_dia"]);

/** Lembretes de aula primeiro (spec §6), depois maior valor esperado, depois o mais antigo. */
export function ordenarFila<T extends Candidato>(c: T[]): T[] {
  return [...c].sort(
    (a, b) =>
      Number(LEMBRETES.has(b.tipo)) - Number(LEMBRETES.has(a.tipo)) ||
      b.valorEsperado - a.valorEsperado ||
      a.aprovadoEm.getTime() - b.aprovadoEm.getTime() ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Aprovados que podem sair, de qualquer dia. `reconferir`: aprovado há mais de 3 dias e sem
 * passar pelo porteiro nos últimos 3 dias (spec §8).
 */
export async function listarCandidatos(
  db: ClienteDb,
): Promise<(Candidato & { reconferir: boolean })[]> {
  const { rows } = await db.query<{
    id: string;
    tipo: string;
    aprovado_em: Date;
    reconferir: boolean;
    etiqueta: string;
    temperatura: string | null;
    horas_estimadas: number | null;
    data_agendada: Date | null;
    preco_hora: string | null;
  }>(
    `select f.id, f.tipo, f.aprovado_em,
            (f.aprovado_em < now() - interval '3 days'
             and (f.reconferido_em is null or f.reconferido_em < now() - interval '3 days'))
              as reconferir,
            l.etiqueta, l.temperatura, l.horas_estimadas, l.data_agendada,
            (select c.valor #>> '{}' from wakeclub.configuracoes c
              where c.chave = 'preco_hora') as preco_hora
       from wakeclub.followups f
       join wakeclub.leads l on l.id = f.lead_id
      where f.status = 'aprovado' and f.aprovado_por is not null
        and l.opt_out = false and l.sem_atendimento = false
        and (f.aula_em is null or f.aula_em > now())`,
  );
  return rows.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    aprovadoEm: r.aprovado_em,
    reconferir: r.reconferir,
    valorEsperado: valorEsperado(
      {
        etiqueta: r.etiqueta,
        temperatura: r.temperatura,
        horasEstimadas: r.horas_estimadas,
        optOut: false,
        semAtendimento: false,
        dataAgendada: r.data_agendada?.toISOString() ?? null,
      },
      Number(r.preco_hora ?? 0),
    ),
  }));
}

/** Porteiro sobre um aprovado antigo; só `enviar: false` barra, erro deixa a linha como está. */
async function liberadoPeloPorteiro(db: ClienteDb, ia: ClienteIa, id: string): Promise<boolean> {
  const parecer = await avaliarPorteiro(db, ia, id).catch((erro: unknown) => {
    logErro("envio.porteiro_falhou", erro, { followupId: id });
    return null;
  });
  if (!parecer?.enviar) {
    if (parecer) await comTransacao((c) => abortar(c, id, BARRADO + parecer.motivo, "aprovado"));
    return false;
  }
  await db.query(
    `update wakeclub.followups set reconferido_em = now()
      where id = $1::uuid and status = 'aprovado'`,
    [id],
  );
  return true;
}

type Reivindicado = {
  id: string;
  texto_enviado: string | null;
  aprovado_por: string;
  telefone: string;
};

/**
 * Passa o escolhido a `enviando` se ainda está `aprovado` e pode sair; outra rodada ou a
 * conversa pode ter mudado o status. Sem texto aborta aqui e devolve null.
 */
function reivindicar(id: string): Promise<Reivindicado | null> {
  return comTransacao(async (c) => {
    const { rows } = await c.query<Reivindicado>(
      `with alvo as (
         select f.id
           from wakeclub.followups f
           join wakeclub.leads l on l.id = f.lead_id
          where f.id = $1::uuid
            and f.status = 'aprovado' and f.aprovado_por is not null
            and l.opt_out = false and l.sem_atendimento = false
          for update of f skip locked
       )
       update wakeclub.followups f
          set status = 'enviando'
         from alvo a, wakeclub.leads l
        where f.id = a.id and f.status = 'aprovado' and l.id = f.lead_id
       returning f.id, f.texto_enviado, f.aprovado_por, l.telefone`,
      [id],
    );
    const r = rows[0];
    if (r && !r.texto_enviado?.trim()) {
      await abortar(c, r.id, "sem texto", "enviando");
      return null;
    }
    return r ?? null;
  });
}

/** Primeiro da fila que pode sair, já `enviando`; null se nenhum. */
async function escolher(db: ClienteDb, ia: ClienteIa | undefined) {
  for (const candidato of ordenarFila(await listarCandidatos(db))) {
    // Sem IA não dá para reconferir: fica na fila e o próximo tem a vez.
    if (candidato.reconferir && !(ia && (await liberadoPeloPorteiro(db, ia, candidato.id)))) {
      continue;
    }
    const f = await reivindicar(candidato.id);
    if (f) return f;
  }
  return null;
}

/** Devolve quantos follow-ups saíram nesta rodada (0 ou 1). */
export async function tarefaEnvioFollowups(deps: {
  adaptador: AdaptadorEvolution;
  ia?: ClienteIa;
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
  if ((await enviadosHoje(db)) >= MODOS[modo].cotaDia) return 0;
  const { rows: intervalo } = await db.query<{ cedo: boolean }>(
    `select coalesce(max(enviado_em) > now() - make_interval(secs => $1::int), false) as cedo
       from wakeclub.followups where status = 'enviado'`,
    [MODOS[modo].intervaloSegundos],
  );
  if (intervalo[0].cedo) return 0;

  const { rows: fila } = await db.query<{ atrasada: boolean }>(
    `select exists (
       select 1 from wakeclub.webhook_eventos
        where origem = 'evolution'
          and ((status in ('pendente', 'processando')
                and recebido_em < now() - interval '2 minutes')
               or (status = 'falhou' and recebido_em > now() - interval '30 minutes'))
     ) as atrasada`,
  );
  if (fila[0].atrasada) {
    logInfo("envio.fila_atrasada");
    return 0;
  }

  const f = await escolher(db, deps.ia);
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
    // A mensagem do erro pode trazer corpo da Evolution: 200 caracteres bastam.
    const mensagem = (erro instanceof Error ? erro.message : String(erro)).slice(0, 200);
    const naoSaiu = erro instanceof ErroEnvio && erro.certeza === "nao_saiu";
    logErro("envio-followups.falha", mensagem, { followupId: f.id, naoSaiu });
    await comTransacao(async (c) => {
      const { rows } = await c.query<{ status: string }>(
        `update wakeclub.followups
            set tentativas_envio = tentativas_envio + 1,
                erro_envio = $2::text,
                status = case when $4::boolean and tentativas_envio + 1 < $3::int
                              then 'aprovado' else status end
          where id = $1::uuid and status = 'enviando'
        returning status`,
        [f.id, mensagem, MAX_TENTATIVAS, naoSaiu],
      );
      if (rows[0]?.status === "enviando") {
        await abortar(c, f.id, naoSaiu ? "falha no envio" : ORFAO, "enviando");
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
