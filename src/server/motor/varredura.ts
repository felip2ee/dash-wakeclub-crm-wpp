/**
 * Varredura sob demanda, o botão "Buscar follow-ups agora" (spec pipeline §7). Cria os
 * follow-ups `parado` que faltam e passa porteiro e redator em todos os pendentes vencidos,
 * sem a cota (ela limita envios, §11). Só prepara: as sugestões caem em
 * `aguardando_aprovacao` na fila do dono do lead e valem até 19h59 do dia seguinte (§13).
 * Uma por vez (índice `varreduras_uma_rodando`); o progresso fica em `varreduras`.
 */
import type { ClienteDb } from "../db";
import type { ClienteIa } from "../ia/tipos";
import { logErro } from "../log";
import { tarefaParados } from "./parado";
import { redigir, type ResultadoRedacao } from "./redator";
import { SQL_VENCIDOS, type Vencido } from "./redator-sql";

const CONFIG_ID = "00000000-0000-0000-0000-000000000001";

export type EstadoVarredura = {
  id: string;
  status: "rodando" | "concluida" | "falhou";
  total: number;
  analisados: number;
  sugeridos: number;
  barrados: number;
  iniciadaEm: string;
  concluidaEm: string | null;
  erro: string | null;
};

type Linha = {
  id: string;
  status: EstadoVarredura["status"];
  total: number;
  analisados: number;
  sugeridos: number;
  barrados: number;
  iniciada_em: Date;
  concluida_em: Date | null;
  erro: string | null;
};

const paraEstado = (r: Linha): EstadoVarredura => ({
  id: r.id,
  status: r.status,
  total: Number(r.total),
  analisados: Number(r.analisados),
  sugeridos: Number(r.sugeridos),
  barrados: Number(r.barrados),
  iniciadaEm: r.iniciada_em.toISOString(),
  concluidaEm: r.concluida_em?.toISOString() ?? null,
  erro: r.erro,
});

// Evento de config no mesmo comando que muda `varreduras` (CTE `v` com id e status).
const EVENTO = (tipo: string, agente: string, origem: string) => `
  insert into wakeclub.eventos_automacao
    (lead_id, agente, tipo_evento, gatilho, decisao, motivo, estado_anterior, estado_novo,
     metadados, entidade_tipo, entidade_id, origem_tipo, correlacao_id)
  select null, '${agente}', '${tipo}', 'painel', 'varredura ' || v.status, null, '{}'::jsonb,
         jsonb_build_object('status', v.status, 'total', v.total, 'sugeridos', v.sugeridos,
                            'barrados', v.barrados),
         jsonb_build_object('varredura_id', v.id), 'config', $1::uuid, '${origem}',
         '${origem}:varredura:' || v.id::text
    from v`;

/** A varredura rodando ou, sem ela, a última encerrada nas últimas 24 h. */
export async function lerVarreduraAtual(db: ClienteDb): Promise<EstadoVarredura | null> {
  const { rows } = await db.query<Linha>(
    `select id, status, total, analisados, sugeridos, barrados, iniciada_em, concluida_em, erro
       from wakeclub.varreduras
      where status = 'rodando' or concluida_em > now() - interval '24 hours'
      order by status = 'rodando' desc, iniciada_em desc
      limit 1`,
  );
  return rows[0] ? paraEstado(rows[0]) : null;
}

/** Registra a varredura e a dispara sem esperar; a segunda simultânea é recusada. */
export async function iniciarVarredura(
  db: ClienteDb,
  ia: ClienteIa,
  adminId: string,
): Promise<{ id: string }> {
  let id: string;
  try {
    const { rows } = await db.query<{ id: string }>(
      `with v as (
         insert into wakeclub.varreduras (iniciada_por) values ($2::uuid)
         returning id, status, total, sugeridos, barrados
       ),
       ev as (${EVENTO("sweep_started", "humano", "painel")})
       select id from v`,
      [CONFIG_ID, adminId],
    );
    id = rows[0].id;
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") {
      throw new Error("Já existe uma varredura em andamento.");
    }
    throw erro;
  }
  void executarVarredura(db, ia, id);
  return { id };
}

const analisados = (r: ResultadoRedacao) =>
  r.sugeridos + r.barrados.length + r.reagendados + r.falhas;

/** Roda a varredura `id` até o fim. Nunca rejeita: qualquer falha vira status `falhou`. */
export async function executarVarredura(db: ClienteDb, ia: ClienteIa, id: string): Promise<void> {
  try {
    await tarefaParados(db);
    const { rows } = await db.query<Vencido>(SQL_VENCIDOS + "\n order by f.agendado_para");
    const ids = rows.map((v) => v.id);
    await db.query("update wakeclub.varreduras set total = $2::int where id = $1::uuid", [
      id,
      ids.length,
    ]);

    // Erro aqui sai do redigir (o callback é aguardado fora do try dele) e cai no catch abaixo.
    const progresso = (r: ResultadoRedacao) =>
      db.query(
        `update wakeclub.varreduras
            set analisados = $2::int, sugeridos = $3::int, barrados = $4::int
          where id = $1::uuid`,
        [id, analisados(r), r.sugeridos, r.barrados.length],
      );
    const r = await redigir(db, ia, ids, {
      diasValidade: 1,
      aoConcluirUm: async (parcial) => {
        await progresso(parcial);
      },
    });

    await db.query(
      `with v as (
         update wakeclub.varreduras
            set status = 'concluida', concluida_em = now(),
                analisados = $3::int, sugeridos = $4::int, barrados = $5::int
          where id = $2::uuid and status = 'rodando'
         returning id, status, total, sugeridos, barrados
       )
       ${EVENTO("sweep_finished", "sistema", "motor")}`,
      [CONFIG_ID, id, analisados(r), r.sugeridos, r.barrados.length],
    );
  } catch (erro) {
    logErro("varredura.falha", erro, { varreduraId: id });
    // Só a mensagem técnica: falhas da IA (que poderiam citar conversa) o redigir já absorve.
    const mensagem = (erro instanceof Error ? erro.message : String(erro)).slice(0, 300);
    await db
      .query(
        `with v as (
           update wakeclub.varreduras
              set status = 'falhou', concluida_em = now(), erro = $3::text
            where id = $2::uuid and status = 'rodando'
           returning id, status, total, sugeridos, barrados
         )
         ${EVENTO("sweep_finished", "sistema", "motor")}`,
        [CONFIG_ID, id, mensagem],
      )
      .catch((e: unknown) => logErro("varredura.marcar_falha", e, { varreduraId: id }));
  }
}
