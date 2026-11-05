// Etapas do funil e regras puras de transição: eventos do app só avançam o lead e a
// IA só etiqueta as etapas de conversa (spec §3). Sem I/O, para servidor e teste.

export const ETAPAS = [
  "Novo lead",
  "Em atendimento",
  "Link enviado",
  "Cadastrado",
  "Aguardando pagamento",
  "Aluno com horas",
  "Aluno sem horas",
  "Encerrado",
] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ETAPAS_DA_IA: readonly Etapa[] = [
  "Novo lead",
  "Em atendimento",
  "Link enviado",
  "Encerrado",
];

export function ordemDa(etapa: string): number {
  const i = (ETAPAS as readonly string[]).indexOf(etapa);
  return i < 0 ? 99 : i + 1;
}

export type TipoEventoApp = "cadastro" | "agendamento" | "aula" | "compra_pendente" | "compra_paga";

export function proximaEtapa(
  atual: string,
  evento: TipoEventoApp,
  saldoDepois: number | null,
): Etapa | null {
  if (atual === "Encerrado") return null;
  const ordem = ordemDa(atual);
  switch (evento) {
    case "cadastro":
      return ordem < 4 ? "Cadastrado" : null;
    case "compra_pendente":
      return ordem < 5 ? "Aguardando pagamento" : null;
    case "compra_paga":
      return ordem < 6 || atual === "Aluno sem horas" ? "Aluno com horas" : null;
    case "aula":
      if (atual === "Aluno com horas" && saldoDepois === 0) return "Aluno sem horas";
      if (saldoDepois !== null && saldoDepois > 0 && ordem < 6) return "Aluno com horas";
      return null;
    default:
      return null;
  }
}

const LEGADO: Record<string, Etapa> = {
  "Novo Lead": "Novo lead",
  Atendimento: "Em atendimento",
  "Negociação encerrada": "Encerrado",
  "Negociacao encerrada": "Encerrado",
};

export function etiquetaDaIa(devolvida: string, atual: string): Etapa | string {
  const e = LEGADO[devolvida] ?? devolvida;
  if (!(ETAPAS_DA_IA as readonly string[]).includes(e)) return atual;
  if (ordemDa(atual) >= 4 && e !== "Encerrado") return atual;
  return e;
}
