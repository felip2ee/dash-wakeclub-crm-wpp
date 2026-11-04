/**
 * Fila `notificacoes` e push (porta do WF-09, design §5): enfileira o aviso de mensagem
 * nova, reivindica pendentes, agrupa por destinatário e tipo e entrega por `entregarPush`.
 */
import { telefone } from "../../lib/formato";
import type { PoolClient } from "../db";
import { logErro } from "../log";
import { entregarPush } from "../push-dispatch";

export type NotificacaoPendente = {
  id: string;
  usuarioId: string | null;
  tipo: string;
  titulo: string;
  corpo: string | null;
  url: string | null;
  filaTotal: number;
};

export type GrupoPush = {
  usuarioId: string | null;
  tipo: string;
  titulo: string;
  corpo: string;
  url: string;
  tag: string;
  ids: string[];
};

/** Avisa o dono do lead (ou os admins, se não há dono) de uma mensagem nova do lead. */
export async function enfileirarMensagemNova(db: PoolClient, leadId: string): Promise<void> {
  const { rows } = await db.query<{
    atendente_id: string | null;
    nome: string | null;
    tel: string;
  }>("select atendente_id, nome, telefone as tel from wakeclub.leads where id = $1::uuid", [
    leadId,
  ]);
  const lead = rows[0];
  if (!lead) return;
  await db.query(
    `insert into wakeclub.notificacoes (usuario_id, tipo, titulo, url)
     values ($1::uuid, 'mensagem', $2::text, $3::text)`,
    [
      lead.atendente_id,
      `Nova mensagem: ${lead.nome?.trim() || telefone(lead.tel)}`,
      lead.atendente_id ? "/meus-leads" : "/",
    ],
  );
}

/** Porte literal do nó "Agrupar por destinatario". */
export function agruparNotificacoes(pendentes: NotificacaoPendente[]): GrupoPush[] {
  const grupos = new Map<string, NotificacaoPendente[]>();
  for (const n of pendentes) {
    const chave = `${n.usuarioId ?? "admins"}|${n.tipo}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), n]);
  }
  const assunto = (t: string) => {
    const p = t.split(": ");
    return (p.length > 1 ? p.slice(1).join(": ") : p[0]).trim();
  };
  return [...grupos.values()].map((itens) => {
    const primeiro = itens[0];
    let titulo = primeiro.titulo;
    let corpo = primeiro.corpo ?? "";
    if (itens.length > 1) {
      const total = Number(primeiro.filaTotal) || itens.length;
      titulo =
        primeiro.tipo === "followup"
          ? `${total} follow-ups esperando`
          : `${itens.length} avisos novos`;
      const nomes = itens.map((i) => assunto(i.titulo)).filter(Boolean);
      corpo =
        nomes.slice(0, 3).join(", ") + (nomes.length > 3 ? ` e mais ${nomes.length - 3}` : "");
    }
    return {
      usuarioId: primeiro.usuarioId,
      tipo: primeiro.tipo,
      titulo: titulo.slice(0, 120),
      corpo: corpo.slice(0, 500),
      url: primeiro.url || "/followups",
      tag: primeiro.tipo,
      ids: itens.map((i) => i.id),
    };
  });
}

/**
 * SQL do nó "Reivindicar notificacoes". Depende de `v_followups_fila`, que só existe em
 * produção (o banco de teste cria um stub com as colunas lidas aqui).
 */
export async function reivindicarNotificacoes(db: PoolClient): Promise<NotificacaoPendente[]> {
  const { rows } = await db.query<{ pendentes: Array<Record<string, unknown>> }>(
    `with orfas as (
       update wakeclub.notificacoes
          set status = 'pendente'
        where status = 'enviando'
          and coalesce(enviada_em, criado_em) < now() - interval '15 minutes'
       returning 1
     ),
     obsoletas as (
       update wakeclub.notificacoes n
          set status = 'cancelada',
              erro = 'followup ja nao esta na fila quando o push ia sair'
        where n.status = 'pendente'
          and n.followup_id is not null
          and not exists (
                select 1 from wakeclub.v_followups_fila q where q.followup_id = n.followup_id
          )
       returning 1
     ),
     alvo as (
       select n.id
         from wakeclub.notificacoes n
        where n.status = 'pendente'
          and (n.followup_id is null
               or exists (
                     select 1 from wakeclub.v_followups_fila q where q.followup_id = n.followup_id
               ))
        order by n.criado_em
        limit 50
        for update skip locked
     ),
     reivindicadas as (
       update wakeclub.notificacoes n
          set status = 'enviando', enviada_em = now()
         from alvo a
        where n.id = a.id
       returning n.id, n.usuario_id, n.tipo, n.titulo, n.corpo, n.url
     )
     select coalesce(json_agg(json_build_object(
              'id', r.id::text, 'usuario_id', r.usuario_id, 'tipo', r.tipo,
              'titulo', r.titulo, 'corpo', r.corpo, 'url', r.url, 'fila_total', f.n
            ) order by r.id), '[]'::json) as pendentes
       from reivindicadas r
       left join lateral (
             select count(*)::int as n
               from wakeclub.v_followups_fila q
              where q.atendente_id = r.usuario_id
       ) f on true`,
  );
  return rows[0].pendentes.map((p) => ({
    id: String(p.id),
    usuarioId: (p.usuario_id as string | null) ?? null,
    tipo: String(p.tipo),
    titulo: String(p.titulo),
    corpo: (p.corpo as string | null) ?? null,
    url: (p.url as string | null) ?? null,
    filaTotal: Number(p.fila_total) || 0,
  }));
}

/** Uma rodada: reivindica, agrupa, entrega e marca `enviada`/`falhou`. `entregar` troca nos testes. */
export async function enviarPushPendentes(
  db: PoolClient,
  entregar: typeof entregarPush = entregarPush,
): Promise<number> {
  const grupos = agruparNotificacoes(await reivindicarNotificacoes(db));
  for (const g of grupos) {
    try {
      await entregar({
        usuarioId: g.usuarioId,
        titulo: g.titulo,
        corpo: g.corpo,
        url: g.url,
        tag: g.tag,
        seAppFechado: g.tipo === "mensagem",
      });
      await db.query(
        `update wakeclub.notificacoes
            set status = 'enviada', enviada_em = now(), erro = null
          where id = any($1::bigint[]) and status = 'enviando'`,
        [g.ids],
      );
    } catch (erro) {
      logErro("push.entrega", erro, { tag: g.tag });
      await db.query(
        `update wakeclub.notificacoes
            set status = 'falhou', erro = left($2::text, 500)
          where id = any($1::bigint[]) and status = 'enviando'`,
        [g.ids, erro instanceof Error ? erro.message : String(erro)],
      );
    }
  }
  return grupos.length;
}
