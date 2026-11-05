/**
 * Entrada de mensagens no CRM (porta do WF-01, design §5.1 e §5.2).
 *
 * Recebe o evento já normalizado pelo adaptador e faz, numa transação: upsert do lead
 * por telefone, mensagem idempotente pelo id da Evolution e o "movimento" (relógios,
 * opt-out, conversa viva cancelando followup, debounce da qualificação). O SQL é o dos
 * nós "Upsert lead", "Gravar mensagem" e "Registrar movimento", inclusive a correlação
 * com `followup_toques` (fluxo wa.me, que sai na fase 3).
 */
import type { PoolClient } from "../db";
import type { AdaptadorEvolution, EventoMensagem, EventoNormalizado } from "../evolution/tipos";
import { atribuirSeSemDono } from "./distribuicao";
import type { Processador } from "./fila";
import { enfileirarMensagemNova } from "./notificacoes";
import { aplicarAck, aplicarConexao } from "./saude";
import { ehOptOut } from "./telefone";

/** Autor do envio pelo app; `followupId` quando a mensagem é o envio de um follow-up. */
export type Autoria = { usuarioId: string; followupId?: string };

export type ResultadoMensagem = { leadId: string; mensagemId: string | null; nova: boolean };

async function upsertLead(db: PoolClient, m: EventoMensagem): Promise<string> {
  // Origem só vem de mensagem do lead e só entra uma vez (a primeira dele): sem marca = 'direto'.
  const o = m.daEquipe ? null : (m.origem ?? null);
  const canal = m.daEquipe ? null : (o?.canal ?? "direto");
  const { rows } = await db.query<{ id: string }>(
    `insert into wakeclub.leads (telefone, nome, origem_canal, origem_app, origem_anuncio_id,
                                 origem_anuncio_titulo, origem_detectada_em)
     values ($1::text, nullif($2::text, ''), $3::text, $4::text, $5::text, $6::text,
             $7::timestamptz)
     on conflict (telefone) do update
        set nome = coalesce(wakeclub.leads.nome, nullif(excluded.nome, '')),
            origem_canal = case when wakeclub.leads.origem_canal is null
                                then excluded.origem_canal else wakeclub.leads.origem_canal end,
            origem_app = case when wakeclub.leads.origem_canal is null
                              then excluded.origem_app else wakeclub.leads.origem_app end,
            origem_anuncio_id = case when wakeclub.leads.origem_canal is null
                              then excluded.origem_anuncio_id
                              else wakeclub.leads.origem_anuncio_id end,
            origem_anuncio_titulo = case when wakeclub.leads.origem_canal is null
                              then excluded.origem_anuncio_titulo
                              else wakeclub.leads.origem_anuncio_titulo end,
            origem_detectada_em = case when wakeclub.leads.origem_canal is null
                              then excluded.origem_detectada_em
                              else wakeclub.leads.origem_detectada_em end
     returning id`,
    [
      m.telefone,
      m.daEquipe ? "" : (m.nome ?? "").slice(0, 120),
      canal,
      o?.app ?? null,
      o?.anuncioId ?? null,
      o?.anuncioTitulo ?? null,
      o ? m.enviadaEm : null,
    ],
  );
  return rows[0].id;
}

async function gravarMensagem(
  db: PoolClient,
  leadId: string,
  m: EventoMensagem,
  autoria?: Autoria,
): Promise<{ id: string; nova: boolean } | null> {
  const enviadaPor = !m.daEquipe ? null : autoria ? "app" : "celular";
  // Envio pelo app: se o eco chegou antes, a linha já existe como "celular" e passa a
  // ser do app, com o autor. Eco depois do envio: conflito, nada muda.
  const conflito = autoria
    ? `do update set usuario_id = excluded.usuario_id, enviada_por = 'app',
                     followup_id = coalesce(excluded.followup_id, wakeclub.mensagens.followup_id)`
    : "do nothing";
  const { rows } = await db.query<{ id: string; nova: boolean }>(
    `insert into wakeclub.mensagens
       (lead_id, direcao, texto, enviada_em, evolution_msg_id, tipo, transcricao_status,
        usuario_id, enviada_por, followup_id)
     values ($1::uuid, $2::text, nullif($3::text, ''), $4::timestamptz, nullif($5::text, ''),
             $6::text,
             case when $6::text = 'audio' and nullif($5::text, '') is not null
                  then 'pendente' end,
             $7::uuid, $8::text, $9::uuid)
     on conflict (evolution_msg_id) ${conflito}
     returning id, (xmax = 0) as nova`,
    [
      leadId,
      m.daEquipe ? "equipe" : "lead",
      m.texto.slice(0, 4000),
      m.enviadaEm,
      m.evolutionMsgId,
      m.tipoMidia,
      autoria?.usuarioId ?? null,
      enviadaPor,
      autoria?.followupId ?? null,
    ],
  );
  return rows[0] ?? null;
}

async function registrarMovimento(db: PoolClient, leadId: string, m: EventoMensagem) {
  const optOut = !m.daEquipe && ehOptOut(m.texto);
  await db.query(
    `with antes as (
       select id, opt_out as opt_out_antes, etiqueta as etiqueta_antes,
              qualificar_apos as qualificar_apos_antes
         from wakeclub.leads where id = $1::uuid
     ),
     mov as (
       update wakeclub.leads l
          set ultima_msg_lead_em = case
                when $2::text = 'lead' then greatest(l.ultima_msg_lead_em, $3::timestamptz)
                else l.ultima_msg_lead_em end,
              ultima_msg_equipe_em = case
                when $2::text = 'equipe' then greatest(l.ultima_msg_equipe_em, $3::timestamptz)
                else l.ultima_msg_equipe_em end,
              n_toques = case when $2::text = 'lead' then 0 else l.n_toques end,
              opt_out = l.opt_out or $4::boolean,
              etiqueta = case when $4::boolean then 'Negociação encerrada' else l.etiqueta end,
              qualificar_apos = case
                when l.opt_out or $4::boolean then null
                else now() + interval '2 minutes' end
        where l.id = $1::uuid
       returning l.id, l.opt_out, l.etiqueta
     ),
     -- Cancela o que ainda não saiu (spec §5); 'enviando' e 'enviado' ficam como estão.
     -- O self-join devolve o status de antes do update para o evento.
     cancelados as (
       update wakeclub.followups f
          set status = 'cancelado',
              motivo_cancelamento = case
                when $4::boolean then 'opt-out: o lead pediu para parar'
                else 'conversa viva: houve movimento' end
         from wakeclub.followups a
        where a.id = f.id and f.lead_id = $1::uuid
          and f.status in ('pendente', 'aguardando_aprovacao', 'aprovado')
       returning f.id, f.lead_id, f.tipo, f.agendado_para, f.motivo_cancelamento,
                 a.status as status_antes
     ),
     notificacoes_canceladas as (
       update wakeclub.notificacoes n
          set status = 'cancelada', erro = c.motivo_cancelamento
         from cancelados c
        where n.followup_id = c.id and n.status = 'pendente'
       returning n.id
     ),
     outbox as (
       insert into wakeclub.crm_outbox (lead_id, tipo, payload)
       select m.id, 'opt_out', jsonb_build_object('etiqueta', m.etiqueta, 'em', $3::timestamptz)
         from mov m join antes a on a.id = m.id
        where m.opt_out and not a.opt_out_antes
       returning id
     ),
     ev_opt_out as (
       insert into wakeclub.eventos_automacao
         (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
          estado_anterior, estado_novo, metadados,
          entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id)
       select m.id, 'sistema', 'opt_out', 'webhook', 'lead pediu para parar',
              'opt-out por regex determinística',
              jsonb_build_object('opt_out', false, 'etiqueta', a.etiqueta_antes,
                                 'qualificar_apos', a.qualificar_apos_antes),
              jsonb_build_object('opt_out', true, 'etiqueta', 'Negociação encerrada',
                                 'qualificar_apos', null),
              '{}'::jsonb, 'lead', m.id, 'motor', $5::text,
              'motor:' || $5::text || ':' || m.id::text
         from mov m join antes a on a.id = m.id
        where m.opt_out and not a.opt_out_antes
       on conflict do nothing
       returning id
     ),
     toque as (
       select distinct on (t.followup_id) t.followup_id, t.aberto_em, t.usuario_id
         from wakeclub.followup_toques t
        where t.followup_id in (select id from cancelados)
          and t.aberto_em >= $3::timestamptz - interval '60 minutes'
          and t.aberto_em <= $3::timestamptz + interval '5 minutes'
        order by t.followup_id, t.aberto_em desc
     ),
     ev_enviado as (
       insert into wakeclub.eventos_automacao
         (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
          estado_anterior, estado_novo, metadados,
          entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id)
       select c.lead_id, 'sistema', 'followup_sent', 'webhook',
              'eco da equipe correlacionado a toque no painel',
              'mensagem da equipe chegou dentro da janela do toque no botao',
              '{}'::jsonb,
              jsonb_build_object('enviado_em', $3::timestamptz),
              jsonb_build_object('janela_min', 60, 'tolerancia_min', 5,
                                 'toque_em', t.aberto_em, 'usuario_id', t.usuario_id),
              'followup', c.id, 'motor', $5::text,
              'motor:' || $5::text || ':' || c.id::text
         from cancelados c join toque t on t.followup_id = c.id
        where $2::text = 'equipe'
       on conflict do nothing
       returning id
     )
     insert into wakeclub.eventos_automacao
       (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
        estado_anterior, estado_novo, metadados,
        entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id)
     select c.lead_id, 'sistema', 'followup_cancelled', 'webhook',
            case when $4::boolean then 'cancelado por opt-out'
                 else 'cancelado por conversa viva' end,
            c.motivo_cancelamento,
            jsonb_build_object('status', c.status_antes, 'tipo', c.tipo,
                               'agendado_para', c.agendado_para),
            jsonb_build_object('status', 'cancelado'),
            jsonb_build_object('direcao', $2::text),
            'followup', c.id, 'motor', $5::text,
            'motor:' || $5::text || ':' || c.id::text
       from cancelados c
     on conflict do nothing`,
    [leadId, m.daEquipe ? "equipe" : "lead", m.enviadaEm, optOut, m.evolutionMsgId],
  );
}

export async function registrarMensagem(
  db: PoolClient,
  m: EventoMensagem,
  autoria?: Autoria,
): Promise<ResultadoMensagem> {
  const leadId = await upsertLead(db, m);
  const gravada = await gravarMensagem(db, leadId, m, autoria);
  if (!gravada?.nova) return { leadId, mensagemId: gravada?.id ?? null, nova: false };
  await registrarMovimento(db, leadId, m);
  return { leadId, mensagemId: gravada.id, nova: true };
}

async function aplicarEvento(db: PoolClient, evento: EventoNormalizado): Promise<void> {
  if (evento.tipo === "ack") return aplicarAck(db, evento.evolutionMsgId, evento.nivel);
  if (evento.tipo === "conexao") return aplicarConexao(db, evento);
  if (evento.tipo !== "mensagem") return;
  const r = await registrarMensagem(db, evento);
  // Só mensagem do lead ganha dono na entrada: conversa iniciada pela equipe com
  // lead sem dono fica com o admin (design §6, decisão do plano).
  if (r.nova && !evento.daEquipe) {
    await atribuirSeSemDono(db, r.leadId, evento.texto);
    await enfileirarMensagemNova(db, r.leadId);
  }
}

/** Processador da origem `evolution` na fila: normaliza e aplica cada evento. */
export function criarProcessadorEvolution(adaptador: AdaptadorEvolution): Processador {
  return async (db, evento) => {
    const itens = adaptador.normalizar(evento.corpo).filter((e) => e.tipo !== "ignorar");
    for (const item of itens) await aplicarEvento(db, item);
    return itens.length > 0 ? "processado" : "ignorado";
  };
}
