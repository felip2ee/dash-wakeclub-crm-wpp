import { Pool } from "pg";

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
