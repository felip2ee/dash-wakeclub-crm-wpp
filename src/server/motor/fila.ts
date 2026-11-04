/**
 * Trabalhador da fila `webhook_eventos` (design §4.1).
 *
 * Eventos da mesma `chave_ordem` (a conversa) saem estritamente em sequência: só a
 * cabeça de cada chave pode ser reivindicada, e uma cabeça em `processando` ou com
 * retentativa futura segura a chave inteira. Chaves diferentes rodam em paralelo.
 * Nada some: falha volta com espera crescente e, na quinta, fica `falhou`, visível e
 * reprocessável pelo admin.
 */
import { type ClienteDb, comTransacao, getPoolMotor, type PoolClient } from "../db";
import { logErro } from "../log";

export type EventoFila = { id: number; origem: string; corpo: unknown; tentativas: number };

export type Processador = (
  db: PoolClient,
  evento: EventoFila,
) => Promise<"processado" | "ignorado">;

const ESPERAS_SEGUNDOS = [30, 120, 600, 1800];

/** Falha que retentar não resolve (ex.: formato desconhecido): vai direto a `falhou`. */
export class ErroPermanente extends Error {}

/** Segundos até a próxima tentativa depois da falha número `tentativas`; null = desistir. */
export function esperaAposFalha(tentativas: number): number | null {
  return ESPERAS_SEGUNDOS[tentativas - 1] ?? null;
}

export async function reivindicar(
  db: ClienteDb,
  limite: number,
  origens: string[],
): Promise<EventoFila[]> {
  const { rows } = await db.query<{
    id: string;
    origem: string;
    corpo: unknown;
    tentativas: number;
  }>(
    `with cabecas as (
       select distinct on (coalesce(chave_ordem, id::text)) id
         from wakeclub.webhook_eventos
        where status in ('pendente', 'processando')
        order by coalesce(chave_ordem, id::text), id
     ), alvo as (
       select e.id
         from wakeclub.webhook_eventos e
         join cabecas c on c.id = e.id
        where e.status = 'pendente'
          and e.proxima_tentativa_em <= now()
          and e.origem = any($2::text[])
          -- A cabeça pode ser um id menor que o do evento já em processamento
          -- (reprocessar, ou inserts que commitam fora da ordem do id).
          and not exists (
            select 1 from wakeclub.webhook_eventos p
             where p.status = 'processando'
               and coalesce(p.chave_ordem, p.id::text) = coalesce(e.chave_ordem, e.id::text))
        order by e.id
        limit $1::int
        for update of e skip locked
     )
     update wakeclub.webhook_eventos e
        set status = 'processando', processando_desde = now()
       from alvo
      where e.id = alvo.id
     returning e.id, e.origem, e.corpo, e.tentativas`,
    [limite, origens],
  );
  return rows
    .map((r) => ({ id: Number(r.id), origem: r.origem, corpo: r.corpo, tentativas: r.tentativas }))
    .sort((a, b) => a.id - b.id);
}

export async function concluir(
  db: ClienteDb,
  id: number,
  status: "processado" | "ignorado",
  erro?: string,
): Promise<void> {
  await db.query(
    `update wakeclub.webhook_eventos
        set status = $2::text, processando_desde = null, erro = $3::text
      where id = $1::bigint`,
    [id, status, erro ?? null],
  );
}

export async function registrarFalha(
  db: ClienteDb,
  id: number,
  erro: string,
  permanente = false,
): Promise<void> {
  // Um comando só: ler e gravar `tentativas` separados deixaria duas falhas contarem uma.
  // O array começa em 1 no SQL, como `esperaAposFalha`; fora dele (null) desiste.
  // Permanente: conta como a última tentativa, sem espera.
  await db.query(
    `update wakeclub.webhook_eventos
        set tentativas = case when $4::boolean then cardinality($3::int[]) + 1 else tentativas + 1 end,
            status = case when $4::boolean or ($3::int[])[tentativas + 1] is null
                          then 'falhou' else 'pendente' end,
            proxima_tentativa_em = now() + make_interval(secs => coalesce(($3::int[])[tentativas + 1], 0)),
            processando_desde = null,
            erro = left($2::text, 1000)
      where id = $1::bigint and status = 'processando'`,
    [id, erro, ESPERAS_SEGUNDOS, permanente],
  );
}

export async function devolverOrfaos(db: ClienteDb): Promise<number> {
  const { rowCount } = await db.query(
    `update wakeclub.webhook_eventos
        set status = 'pendente', processando_desde = null
      where status = 'processando'
        and processando_desde < now() - interval '15 minutes'`,
  );
  return rowCount ?? 0;
}

export async function reprocessar(db: ClienteDb, id: number): Promise<boolean> {
  const { rowCount } = await db.query(
    `update wakeclub.webhook_eventos
        set status = 'pendente', tentativas = 0, proxima_tentativa_em = now(), erro = null
      where id = $1::bigint and status = 'falhou' and not (corpo ? 'descartado')`,
    [id],
  );
  return rowCount === 1;
}

/** Uma rodada: reivindica até `paralelo` cabeças e processa cada uma na própria transação. */
export async function rodarFila(
  processadores: Partial<Record<string, Processador>>,
  paralelo = 4,
): Promise<number> {
  const origens = Object.keys(processadores);
  if (origens.length === 0) return 0;
  const eventos = await reivindicar(getPoolMotor(), paralelo, origens);

  await Promise.all(
    eventos.map(async (evento) => {
      const processar = processadores[evento.origem];
      if (!processar) return;
      try {
        await comTransacao(async (cliente) => {
          await concluir(cliente, evento.id, await processar(cliente, evento));
        });
      } catch (erro) {
        logErro("fila.falha", erro, { eventoId: evento.id, origem: evento.origem });
        await registrarFalha(
          getPoolMotor(),
          evento.id,
          String((erro as Error)?.message ?? erro),
          erro instanceof ErroPermanente,
        );
      }
    }),
  );
  return eventos.length;
}
