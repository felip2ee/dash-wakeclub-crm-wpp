/**
 * Server fns do botão "Buscar follow-ups agora" em `/aprovar` (spec pipeline §7): o admin vê
 * quantos follow-ups serão analisados, confirma com `s` e acompanha o progresso. A varredura em si
 * mora em `motor/varredura.ts`; aqui ficam a autorização e a validação da entrada.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAdmin } from "./auth";
import { getPoolMotor } from "./db";
import { criarClienteOpenAi } from "./ia/openai";
import { contarParados } from "./motor/parado";
import {
  contarVencidos,
  type EstadoVarredura,
  iniciarVarredura,
  lerVarreduraAtual,
} from "./motor/varredura";

export type PainelVarredura = {
  /** Chamadas pagas previstas: parados novos mais pendentes vencidos (conjuntos disjuntos). */
  aAnalisar: number;
  atual: EstadoVarredura | null;
  iaDisponivel: boolean;
};

export const getVarredura = createServerFn({ method: "GET" }).handler(
  async (): Promise<PainelVarredura> => {
    await exigirAdmin();
    const db = getPoolMotor();
    const [parados, vencidos, atual] = await Promise.all([
      contarParados(db),
      contarVencidos(db),
      lerVarreduraAtual(db),
    ]);
    return { aAnalisar: parados + vencidos, atual, iaDisponivel: criarClienteOpenAi() !== null };
  },
);

export const iniciarVarreduraAdmin = createServerFn({ method: "POST" })
  .validator(z.object({ confirmo: z.literal("s") }))
  .handler(async (): Promise<{ id: string }> => {
    const admin = await exigirAdmin();
    const ia = criarClienteOpenAi();
    if (!ia) throw new Error("IA indisponível: configure OPENAI_API_KEY.");
    return iniciarVarredura(getPoolMotor(), ia, admin.usuarioId);
  });
