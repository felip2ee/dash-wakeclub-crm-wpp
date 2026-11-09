/**
 * Liga o motor neste processo: trabalhador da fila e tarefas agendadas.
 *
 * Só é chamado pelo plugin de boot `nitro-plugin.ts` com `MOTOR_ATIVO=1`. Idempotente: o HMR do dev
 * reavalia módulos, e dois trabalhadores no mesmo processo seriam desperdício.
 * `pararMotor()` desliga tudo no encerramento (SIGTERM): para os timers e espera as rodadas
 * em curso, para o processo sair sozinho.
 */
import { registrarExecucao } from "../admin-ia";
import { obterAdaptador } from "../evolution";
import type { AdaptadorEvolution } from "../evolution/tipos";
import { comTransacao, getPoolMotor } from "../db";
import { criarClienteOpenAi } from "../ia/openai";
import { logErro, logInfo } from "../log";
import { agendar as agendarSemRegistro } from "./agenda";
import { tarefaComprovantes } from "./comprovantes";
import { redistribuirSoltos, soltarDeInativos } from "./distribuicao";
import { tarefaEnvioFollowups } from "./envio-followups";
import { devolverOrfaos, type Processador, rodarFila } from "./fila";
import { criarProcessadorEvolution } from "./ingestao";
import { enviarPushPendentes } from "./notificacoes";
import { tarefaPagamentoPendente, tarefaParados } from "./parado";
import { tarefaQualificador } from "./qualificador";
import { tarefaRedator } from "./redator";
import { tarefaExpirarFollowups, tarefaRitmoMeiaNoite } from "./ritmo";
import { gravarHeartbeat } from "./saude";
import { tarefaTranscricao } from "./transcricao";
import { criarProcessadorVendas } from "./vendas";

declare global {
  var __wakecrmMotor: boolean | undefined;
}

const MINUTO = 60_000;
const ESPERA_PARADA_MS = 8_000;

const intervalos: ReturnType<typeof setInterval>[] = [];
const emCurso = new Set<Promise<unknown>>();
let parando = false;
let parada: Promise<void> | undefined;

function rastrear<T>(p: Promise<T>): Promise<T> {
  emCurso.add(p);
  const sair = () => emCurso.delete(p);
  void p.then(sair, sair);
  return p;
}

// Toda tarefa grava a última execução, que o painel de IA do admin mostra.
function agendar(nome: string, intervaloMs: number, tarefa: () => Promise<void>) {
  intervalos.push(
    agendarSemRegistro(nome, intervaloMs, async () => {
      if (parando) return;
      await rastrear(
        (async () => {
          await tarefa();
          await registrarExecucao(getPoolMotor(), nome);
        })(),
      );
    }),
  );
}

/**
 * Idempotente. Para os timers e espera as rodadas em curso por até 8 s. Não fecha os pools:
 * o HTTP ainda drena e usa os mesmos; com `allowExitOnIdle` eles não seguram o processo.
 */
export function pararMotor(): Promise<void> {
  parada ??= (async () => {
    parando = true;
    for (const i of intervalos) clearInterval(i);
    await Promise.race([
      Promise.allSettled([...emCurso]),
      new Promise((r) => setTimeout(r, ESPERA_PARADA_MS).unref()),
    ]);
    logInfo("motor.parado", { rodadasPendentes: emCurso.size });
  })();
  return parada;
}

// Fases 2-3: ritmo, expiração, envio dos aprovados e as tarefas de IA.
function agendarIaEFollowups(adaptador: AdaptadorEvolution | null) {
  agendar("ritmo-meia-noite", 5 * MINUTO, async () => {
    await tarefaRitmoMeiaNoite(getPoolMotor());
  });
  agendar("expirar-followups", 5 * MINUTO, async () => {
    await tarefaExpirarFollowups(getPoolMotor());
  });
  // Não dependem de IA: só olham prazos e eventos.
  agendar("parado", 15 * MINUTO, async () => void (await tarefaParados(getPoolMotor())));
  agendar(
    "pagamento-pendente",
    5 * MINUTO,
    async () => void (await tarefaPagamentoPendente(getPoolMotor())),
  );

  // Sem chave da OpenAI as tarefas de IA ficam de fora; a transcrição precisa também do
  // adaptador para baixar o áudio. O envio usa `ia` na reconferência dos aprovados antigos.
  const ia = criarClienteOpenAi();
  if (adaptador) {
    agendar("envio-followups", MINUTO, async () => {
      await tarefaEnvioFollowups({ adaptador, ia: ia ?? undefined });
    });
  }
  if (ia) {
    agendar("qualificador", MINUTO, async () => void (await tarefaQualificador({ ia })));
    agendar("redator", 15 * MINUTO, async () => void (await tarefaRedator({ ia })));
    if (adaptador) {
      agendar("transcricao", MINUTO, async () => void (await tarefaTranscricao({ ia, adaptador })));
      agendar(
        "comprovantes",
        2 * MINUTO,
        async () => void (await tarefaComprovantes({ ia, adaptador })),
      );
    }
  } else {
    logInfo("ia.sem_chave");
  }
}

export function iniciarMotor(): void {
  if (globalThis.__wakecrmMotor) return;
  globalThis.__wakecrmMotor = true;

  // Sem adaptador, eventos da Evolution ficam pendentes na fila até a captura virar
  // código (plano, Task 13). Vendas não dependem do adaptador.
  const processadores: Partial<Record<string, Processador>> = { vendas: criarProcessadorVendas() };
  const adaptador = obterAdaptador();
  if (adaptador) processadores.evolution = criarProcessadorEvolution(adaptador);

  // A fila não usa trava global: a reivindicação com SKIP LOCKED já é segura entre réplicas.
  let rodando = false;
  const fila = setInterval(() => {
    if (rodando || parando) return;
    rodando = true;
    void rastrear(
      (async () => {
        try {
          while (!parando && (await rodarFila(processadores)) > 0);
        } catch (erro) {
          logErro("fila.rodada", erro);
        } finally {
          rodando = false;
        }
      })(),
    );
  }, 2_000);
  intervalos.push(fila.unref());

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

  agendarIaEFollowups(adaptador);

  logInfo("motor.iniciado", { adaptador: adaptador !== null });
}
