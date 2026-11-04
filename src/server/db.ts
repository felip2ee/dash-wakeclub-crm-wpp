import { Pool, type PoolClient } from "pg";

export type { PoolClient };
export type ClienteDb = Pool | PoolClient;

/**
 * Conexão com o CRM (banco `wakeclub`, schema `wakeclub`).
 *
 * O painel é ESPELHO: só lê. Duas travas garantem isso, porque uma só não
 * basta — a primeira depende de o banco estar configurado certo, a segunda
 * depende de o código estar certo, e elas falham por motivos diferentes:
 *
 *  1. A DATABASE_URL aponta para a role `painel_ro`, que tem SELECT apenas nas
 *     views expostas (ver db/painel-role.sql).
 *  2. `default_transaction_read_only=on` na própria conexão — se um dia alguém
 *     der permissão demais para a role, o INSERT ainda estoura aqui.
 *
 * Cuidado: o banco do CRM é `wakeclub`. O `n8n_queue` é o banco interno do n8n
 * e o painel não deve encostar nele.
 */

declare global {
  var __wakeclubPool: Pool | undefined;
  var __wakeclubPoolRw: Pool | undefined;
  var __wakeclubPoolMotor: Pool | undefined;
  var __wakeclubPoolWebhook: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL não definida. Copie .env.example para .env e preencha com a " +
        "role read-only do banco wakeclub.",
    );
  }

  return new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    options: "-c default_transaction_read_only=on",
  });
}

/**
 * Singleton. Em dev o Vite recarrega o módulo a cada save; sem isto cada HMR
 * abriria um pool novo e o Postgres acabaria recusando conexão.
 */
export function getPool(): Pool {
  if (!globalThis.__wakeclubPool) {
    globalThis.__wakeclubPool = createPool();
  }
  return globalThis.__wakeclubPool;
}

/**
 * Conexão limitada de ESCRITA do painel.
 *
 * Esta role alcança somente sessão, inscrição de push, log de toques e as
 * colunas administrativas explicitamente liberadas. Nunca use este pool para
 * escrever no fluxo do CRM (leads, mensagens, followups ou outbox).
 */
export function getPoolRw(): Pool {
  if (!globalThis.__wakeclubPoolRw) {
    const connectionString = process.env.DATABASE_URL_RW;

    if (!connectionString) {
      throw new Error(
        "DATABASE_URL_RW não definida. Configure a role limitada painel_rw antes de usar autenticação.",
      );
    }

    globalThis.__wakeclubPoolRw = new Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  return globalThis.__wakeclubPoolRw;
}

/**
 * Conexão do MOTOR (role `wakecrm_motor`), dona das escritas do CRM desde a fase 1
 * do WakeCRM: fila de webhooks, leads, mensagens, distribuição, saúde e
 * notificações. Não lê `usuarios.senha_hash` (grant por coluna).
 */
export function getPoolMotor(): Pool {
  if (!globalThis.__wakeclubPoolMotor) {
    const connectionString = process.env.DATABASE_URL_MOTOR;

    if (!connectionString) {
      throw new Error("DATABASE_URL_MOTOR não definida. Configure a role wakecrm_motor.");
    }

    globalThis.__wakeclubPoolMotor = new Pool({
      connectionString,
      max: 12,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  return globalThis.__wakeclubPoolMotor;
}

/**
 * Mesma role do motor, pool separado e só do endpoint de webhook (`webhooks/receber.ts`):
 * um pico de processamento no motor não pode esgotar a conexão que grava o evento bruto,
 * senão o webhook se perde (design §4.1).
 */
export function getPoolWebhook(): Pool {
  if (!globalThis.__wakeclubPoolWebhook) {
    const connectionString = process.env.DATABASE_URL_MOTOR;

    if (!connectionString) {
      throw new Error("DATABASE_URL_MOTOR não definida. Configure a role wakecrm_motor.");
    }

    globalThis.__wakeclubPoolWebhook = new Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  return globalThis.__wakeclubPoolWebhook;
}

/** Roda `fn` numa transação do pool do motor; rollback em qualquer erro. */
export async function comTransacao<T>(fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await getPoolMotor().connect();
  try {
    await cliente.query("begin");
    const resultado = await fn(cliente);
    await cliente.query("commit");
    return resultado;
  } catch (erro) {
    await cliente.query("rollback");
    throw erro;
  } finally {
    cliente.release();
  }
}
