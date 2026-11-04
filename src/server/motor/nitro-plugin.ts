/**
 * Liga o motor no boot do servidor Nitro, antes de qualquer requisição.
 *
 * O `src/server.ts` só é carregado na primeira requisição HTTP (o Nitro importa o SSR
 * sob demanda); um restart sem tráfego deixaria fila e tarefas paradas. Só liga com
 * `MOTOR_ATIVO=1`: dois motores escrevendo no mesmo CRM brigam (design §2).
 */
import { definePlugin } from "nitro";

export default definePlugin(() => {
  if (process.env.MOTOR_ATIVO !== "1") return;
  void import("./iniciar").then((m) => m.iniciarMotor());
});
