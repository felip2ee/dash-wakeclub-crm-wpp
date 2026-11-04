/**
 * Tarefas periódicas do motor, dentro do próprio processo (design §4.2).
 *
 * Cada execução pega um advisory lock por nome num cliente dedicado; se outra réplica
 * já está rodando a mesma tarefa, esta rodada pula. Erro é logado e a próxima rodada
 * tenta de novo, sem derrubar o processo.
 */
import { getPoolMotor } from "../db";
import { logErro } from "../log";

/** Roda `tarefa` só se conseguir a trava `wakecrm:<nome>`. Devolve se rodou. */
export async function tentarRodar(nome: string, tarefa: () => Promise<void>): Promise<boolean> {
  const cliente = await getPoolMotor().connect();
  const chave = `wakecrm:${nome}`;
  try {
    const { rows } = await cliente.query<{ ok: boolean }>(
      "select pg_try_advisory_lock(hashtext($1::text)) as ok",
      [chave],
    );
    if (!rows[0]?.ok) return false;
    try {
      await tarefa();
    } finally {
      await cliente.query("select pg_advisory_unlock(hashtext($1::text))", [chave]);
    }
    return true;
  } finally {
    cliente.release();
  }
}

export function agendar(nome: string, intervaloMs: number, tarefa: () => Promise<void>) {
  let rodando = false;
  const tick = async () => {
    if (rodando) return;
    rodando = true;
    try {
      await tentarRodar(nome, tarefa);
    } catch (erro) {
      logErro("agenda.falha", erro, { tarefa: nome });
    } finally {
      rodando = false;
    }
  };
  void tick();
  return setInterval(() => void tick(), intervaloMs);
}
