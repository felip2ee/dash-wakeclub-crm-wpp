/**
 * Sinal "parado" por etapa e pagamento pendente cancelado (spec §5).
 *
 * Substitui o `reengajar` que o qualificador agendava (spec §13): em vez de a IA escolher
 * uma data, o motor cria um follow-up `parado` quando o lead passa do prazo da etapa sem
 * resposta. O pagamento pendente há mais de 24 h volta para Cadastrado, já parado. Os
 * prazos moram em `configuracoes.prazos_parado` e chegam ao SQL por parâmetro.
 */
import { z } from "zod";

import type { ClienteDb } from "../db";

export type Prazos = {
  emAtendimentoH: number;
  linkEnviadoH: number;
  cadastradoH: number;
  alunoComHorasDias: number;
  alunoSemHorasDias: number;
  silencioAlunosH: number;
  pagamentoPendenteH: number;
};

export const PRAZOS_PADRAO: Prazos = {
  emAtendimentoH: 24,
  linkEnviadoH: 24,
  cadastradoH: 24,
  alunoComHorasDias: 7,
  alunoSemHorasDias: 15,
  silencioAlunosH: 48,
  pagamentoPendenteH: 24,
};

const horas = z.number().int().min(1).max(720);
const dias = z.number().int().min(1).max(90);
const CAMPOS = {
  emAtendimentoH: ["em_atendimento_h", horas],
  linkEnviadoH: ["link_enviado_h", horas],
  cadastradoH: ["cadastrado_h", horas],
  alunoComHorasDias: ["aluno_com_horas_dias", dias],
  alunoSemHorasDias: ["aluno_sem_horas_dias", dias],
  silencioAlunosH: ["silencio_alunos_h", horas],
  pagamentoPendenteH: ["pagamento_pendente_h", horas],
} as const satisfies Record<keyof Prazos, readonly [string, z.ZodNumber]>;
const CHAVES = Object.keys(CAMPOS) as (keyof Prazos)[];

export const schemaPrazos: z.ZodType<Prazos> = z.object({
  emAtendimentoH: horas,
  linkEnviadoH: horas,
  cadastradoH: horas,
  alunoComHorasDias: dias,
  alunoSemHorasDias: dias,
  silencioAlunosH: horas,
  pagamentoPendenteH: horas,
});

/** jsonb snake_case de `configuracoes` para Prazos; campo ausente ou inválido fica no padrão. */
export function prazosDe(valor: unknown): Prazos {
  const o = (valor && typeof valor === "object" ? valor : {}) as Record<string, unknown>;
  const p = { ...PRAZOS_PADRAO };
  for (const k of CHAVES) {
    const [chave, schema] = CAMPOS[k];
    const r = schema.safeParse(o[chave]);
    if (r.success) p[k] = r.data;
  }
  return p;
}

export async function lerPrazos(db: ClienteDb): Promise<Prazos> {
  const { rows } = await db.query<{ valor: unknown }>(
    "select valor from wakeclub.configuracoes where chave = 'prazos_parado'",
  );
  return prazosDe(rows[0]?.valor);
}

export async function gravarPrazos(db: ClienteDb, p: Prazos): Promise<void> {
  const v = schemaPrazos.parse(p);
  const json = Object.fromEntries(CHAVES.map((k) => [CAMPOS[k][0], v[k]]));
  await db.query(
    `insert into wakeclub.configuracoes (chave, valor) values ('prazos_parado', $1::jsonb)
     on conflict (chave) do update set valor = excluded.valor`,
    [JSON.stringify(json)],
  );
}

export const OBJETIVOS = {
  "Em atendimento": "retomar o interesse",
  "Link enviado": "concluir o cadastro",
  Cadastrado: "escolher pacote e pagar",
  "Aluno com horas": "agendar a próxima aula",
  "Aluno sem horas": "recompra de horas",
  pagamento_cancelado: "concluir a compra do pacote que ficou pendente",
} as const;

const ABERTO = `select 1 from wakeclub.followups f
                 where f.lead_id = l.id
                   and f.status in ('pendente', 'aguardando_aprovacao', 'aprovado', 'enviando')`;

/**
 * Leads parados agora. Parâmetros: $1 em atendimento (h), $2 link enviado (h), $3 cadastrado
 * (h), $4 aluno com horas (dias), $5 aluno sem horas (dias), $6 silêncio dos alunos (h).
 */
export const SQL_PARADOS = `
  select l.id, l.etiqueta
    from wakeclub.leads l
   where l.atendente_id is not null and not l.opt_out and not l.sem_atendimento
     and not exists (${ABERTO})
     -- Um \`parado\` por episódio: encerrado (abortado, recusado, expirado) só volta com atividade nova.
     and not exists (select 1 from wakeclub.followups f
                      where f.lead_id = l.id and f.tipo = 'parado'
                        and f.criado_em > coalesce(greatest(l.ultima_msg_lead_em, l.ultima_msg_equipe_em,
                              l.ultimo_evento_app_em, l.ultima_aula_em), '-infinity'))
     and (
       (l.etiqueta in ('Em atendimento', 'Link enviado', 'Cadastrado')
        and l.ultima_msg_equipe_em is not null
        and (l.ultima_msg_lead_em is null or l.ultima_msg_lead_em < l.ultima_msg_equipe_em)
        and l.ultima_msg_equipe_em < now() - make_interval(hours => case l.etiqueta
              when 'Em atendimento' then $1::int
              when 'Link enviado' then $2::int
              else $3::int end)
        and (l.ultimo_evento_app_em is null or l.ultimo_evento_app_em < l.ultima_msg_equipe_em))
       or
       (l.etiqueta in ('Aluno com horas', 'Aluno sem horas')
        and coalesce(greatest(l.ultima_msg_lead_em, l.ultima_msg_equipe_em), '-infinity')
              < now() - make_interval(hours => $6::int)
        and ((l.etiqueta = 'Aluno com horas'
              and l.saldo_horas > 0
              and (l.proxima_aula_em is null or l.proxima_aula_em < now())
              and coalesce(greatest(l.ultima_aula_em, l.ultimo_evento_app_em), '-infinity')
                    < now() - make_interval(days => $4::int))
             or
             (l.etiqueta = 'Aluno sem horas'
              and l.ultima_aula_em < now() - make_interval(days => $5::int))))
     )`;

const parametros = (p: Prazos) => [
  p.emAtendimentoH,
  p.linkEnviadoH,
  p.cadastradoH,
  p.alunoComHorasDias,
  p.alunoSemHorasDias,
  p.silencioAlunosH,
];

export async function contarParados(db: ClienteDb): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from (${SQL_PARADOS}) p`,
    parametros(await lerPrazos(db)),
  );
  return rows[0].n;
}

// Follow-up `parado` e seu `followup_created` no mesmo comando, a partir do CTE `alvo`
// (id, etiqueta, motivo) de quem chama; o índice de follow-up aberto barra corrida com outro criador.
const CRIAR_FOLLOWUP = `
  criado as (
    insert into wakeclub.followups (lead_id, agendado_para, tipo, motivo, status)
    select a.id, now(), 'parado', a.motivo, 'pendente' from alvo a
    on conflict do nothing
    returning id, lead_id, agendado_para, motivo
  ),
  ev as (
    insert into wakeclub.eventos_automacao
      (lead_id, agente, tipo_evento, gatilho, decisao, motivo, estado_anterior, estado_novo,
       metadados, entidade_tipo, entidade_id, origem_tipo, correlacao_id)
    select c.lead_id, 'parado', 'followup_created', 'schedule', 'parado em ' || a.etiqueta,
           c.motivo, '{}'::jsonb,
           jsonb_build_object('tipo', 'parado', 'agendado_para', c.agendado_para, 'motivo', c.motivo),
           '{}'::jsonb, 'followup', c.id, 'motor', 'motor:parado:' || c.id::text
      from criado c join alvo a on a.id = c.lead_id
  )`;

/** Cria um follow-up `parado` pendente para cada lead parado. Devolve quantos criou. */
export async function tarefaParados(db: ClienteDb): Promise<number> {
  const p = await lerPrazos(db);
  const { rows } = await db.query<{ n: number }>(
    `with alvo as (
       select p.id, p.etiqueta, $7::jsonb ->> p.etiqueta as motivo from (${SQL_PARADOS}) p
     ),
     ${CRIAR_FOLLOWUP}
     select count(*)::int as n from criado`,
    [...parametros(p), JSON.stringify(OBJETIVOS)],
  );
  return rows[0].n;
}

/**
 * Pagamento pendente há mais do prazo é tratado como cancelado: volta para Cadastrado com
 * `stage_changed` e, se o lead pode receber follow-up, um `parado` para concluir a compra.
 * Devolve quantos leads voltaram.
 */
export async function tarefaPagamentoPendente(db: ClienteDb): Promise<number> {
  const p = await lerPrazos(db);
  const { rows } = await db.query<{ n: number }>(
    `with vencido as (
       select l.id, l.pagamento_pendente_desde as desde
         from wakeclub.leads l
        where l.etiqueta = 'Aguardando pagamento'
          and l.pagamento_pendente_desde < now() - make_interval(hours => $1::int)
        for update skip locked
     ),
     movido as (
       update wakeclub.leads l
          set etiqueta = 'Cadastrado', pagamento_pendente_desde = null
         from vencido v
        where l.id = v.id
       returning l.id, v.desde
     ),
     mudou as (
       insert into wakeclub.eventos_automacao
         (lead_id, agente, tipo_evento, gatilho, decisao, motivo, estado_anterior, estado_novo,
          metadados, entidade_tipo, entidade_id, origem_tipo, correlacao_id)
       select m.id, 'parado', 'stage_changed', 'schedule', 'Aguardando pagamento -> Cadastrado',
              'pagamento pendente há mais de ' || $1::int || ' h tratado como cancelado',
              jsonb_build_object('etiqueta', 'Aguardando pagamento', 'pagamento_pendente_desde', m.desde),
              jsonb_build_object('etiqueta', 'Cadastrado'),
              jsonb_build_object('causa', 'payment_pending_expired'),
              'lead', m.id, 'motor',
              'motor:pagamento:' || m.id::text || ':' || extract(epoch from m.desde)::text
         from movido m
       on conflict do nothing
     ),
     alvo as (
       select m.id, 'Cadastrado'::text as etiqueta, $2::text as motivo
         from movido m join wakeclub.leads l on l.id = m.id
        where l.atendente_id is not null and not l.opt_out and not l.sem_atendimento
          and not exists (${ABERTO})
     ),
     ${CRIAR_FOLLOWUP}
     select count(*)::int as n from movido`,
    [p.pagamentoPendenteH, OBJETIVOS.pagamento_cancelado],
  );
  return rows[0].n;
}
