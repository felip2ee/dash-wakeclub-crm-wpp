/**
 * Liga o motor neste processo: trabalhador da fila e tarefas agendadas.
 *
 * Só é chamado pelo plugin de boot `nitro-plugin.ts` com `MOTOR_ATIVO=1`. Idempotente: o HMR do dev
 * reavalia módulos, e dois trabalhadores no mesmo processo seriam desperdício.
 */
import { obterAdaptador } from "../evolution";
import { comTransacao, getPoolMotor } from "../db";
import { logErro, logInfo } from "../log";
import { agendar } from "./agenda";
import { redistribuirSoltos, soltarDeInativos } from "./distribuicao";
import { devolverOrfaos, type Processador, rodarFila } from "./fila";
import { criarProcessadorEvolution } from "./ingestao";
import { enviarPushPendentes } from "./notificacoes";
import { gravarHeartbeat } from "./saude";

declare global {
  var __wakecrmMotor: boolean | undefined;
}

const MINUTO = 60_000;

export function iniciarMotor(): void {
  if (globalThis.__wakecrmMotor) return;
  globalThis.__wakecrmMotor = true;

  // Sem adaptador, eventos da Evolution ficam pendentes na fila até a captura virar
  // código (plano, Task 13). Vendas só são gravadas nesta fase.
  const processadores: Partial<Record<string, Processador>> = {};
  const adaptador = obterAdaptador();
  if (adaptador) processadores.evolution = criarProcessadorEvolution(adaptador);

  // A fila não usa trava global: a reivindicação com SKIP LOCKED já é segura entre réplicas.
  let rodando = false;
  setInterval(() => {
    if (rodando) return;
    rodando = true;
    void (async () => {
      try {
        while ((await rodarFila(processadores)) > 0);
      } catch (erro) {
        logErro("fila.rodada", erro);
      } finally {
        rodando = false;
      }
    })();
  }, 2_000);

  agendar("orfaos", 5 * MINUTO, async () => void (await devolverOrfaos(getPoolMotor())));
  agendar("distribuicao", 5 * MINUTO, async () => {
    await comTransacao(async (c) => {
      await soltarDeInativos(c);
      await redistribuirSoltos(c);
    });
  });

  agendar("push", MINUTO, async () => {
    await enviarPushPendentes();
  });

  if (adaptador) {
    const instancia = process.env.EVOLUTION_INSTANCIA ?? "wakeclub";
    agendar("heartbeat", 5 * MINUTO, async () => {
      let resultado: { estado: string } | { erro: string };
      try {
        resultado = { estado: await adaptador.estadoConexao() };
      } catch (erro) {
        resultado = { erro: erro instanceof Error ? erro.message : String(erro) };
      }
      await comTransacao((c) => gravarHeartbeat(c, instancia, resultado));
    });
  }

  logInfo("motor.iniciado", { adaptador: adaptador !== null });
}
