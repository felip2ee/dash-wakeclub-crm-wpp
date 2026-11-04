/**
 * Liga o motor no boot do servidor Nitro, antes de qualquer requisição.
 *
 * O `src/server.ts` só é carregado na primeira requisição HTTP (o Nitro importa o SSR
 * sob demanda); um restart sem tráfego deixaria fila e tarefas paradas. Só liga com
 * `MOTOR_ATIVO=1`: dois motores escrevendo no mesmo CRM brigam (design §2). No encerramento
 * (hook `close` ou SIGTERM/SIGINT) chama `pararMotor()` para o processo sair limpo.
 */
import { definePlugin } from "nitro";

import { logErro } from "../log";

export default definePlugin((nitroApp) => {
  if (process.env.MOTOR_ATIVO !== "1") return;
  const motor = import("./iniciar");
  void motor.then((m) => m.iniciarMotor()).catch((erro) => logErro("motor.boot", erro));

  const parar = () =>
    motor.then((m) => m.pararMotor()).catch((erro) => logErro("motor.parada", erro));
  nitroApp.hooks.hook("close", parar);
  // O runtime de produção não chama o hook `close` no sinal: o srvx só fecha o HTTP. Sem
  // timers e pools do motor vivos, o processo sai sozinho depois disso. Rodada presa (IA de
  // 90 s) não o segura além de 9 s: o lease do qualificador e o órfão do envio cobrem o
  // que ficar pela metade.
  for (const sinal of ["SIGTERM", "SIGINT"] as const) {
    process.once(sinal, () => {
      void parar();
      setTimeout(() => {
        logErro("motor.saida_forcada", new Error("rodada ou conexão presa depois de 9 s"));
        process.exit(1);
      }, 9_000).unref();
    });
  }
});
