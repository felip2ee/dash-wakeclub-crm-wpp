import { MOTIVOS_ENVIO, MOTIVOS_RECUSA } from "@/server/aprovacao";

// As listas moram no servidor (o Zod de decidirFollowup valida contra elas); a tela só
// reexporta para os chips não divergirem do que o servidor aceita.
export { MOTIVOS_ENVIO, MOTIVOS_RECUSA };

export type Decisao = "enviar" | "recusar";

export function motivosDa(decisao: Decisao): readonly string[] {
  return decisao === "enviar" ? MOTIVOS_ENVIO : MOTIVOS_RECUSA;
}

/** Cada motivo pertence à lista da decisão e aparece uma vez; vazio vale (Pular). */
export function validarMotivos(decisao: Decisao, motivos: readonly string[]): boolean {
  const lista = motivosDa(decisao);
  return new Set(motivos).size === motivos.length && motivos.every((m) => lista.includes(m));
}
