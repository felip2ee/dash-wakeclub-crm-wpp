/**
 * Valor de um lead (design §9.1, spec §7): horas × preço da hora × chance de fechar
 * por etapa e temperatura. Função pura: o redator ordena vencidos por ela e a fase 4
 * reaproveita no Kanban. As chances são premissas do artefato de pipeline, não histórico.
 */

export const CHANCES: Record<string, Record<string, number>> = {
  "Aguardando pagamento": { quente: 0.7, morno: 0.7, frio: 0.7 },
  Cadastrado: { quente: 0.4, morno: 0.3, frio: 0.2 },
  "Link enviado": { quente: 0.4, morno: 0.2, frio: 0.2 },
  "Em atendimento": { quente: 0.25, morno: 0.12, frio: 0.04 },
  "Novo lead": { quente: 0.05, morno: 0.05, frio: 0.05 },
  "Aluno sem horas": { quente: 0.3, morno: 0.15, frio: 0.05 },
};

// Etapa fora da tabela (ex.: Agendado no futuro) ou lead sem temperatura.
const CHANCE_PADRAO = 0.05;

const FORA_DO_PIPELINE = new Set(["Encerrado", "Aluno com horas"]);

export type LeadValor = {
  etiqueta: string;
  temperatura: string | null;
  horasEstimadas: number | null;
  optOut: boolean;
  semAtendimento: boolean;
  dataAgendada: string | null;
};

export function valorCheio(horas: number | null, precoHora: number): number {
  return (horas ?? 1) * precoHora;
}

export function valorEsperado(l: LeadValor, precoHora: number): number {
  if (l.optOut || l.semAtendimento || FORA_DO_PIPELINE.has(l.etiqueta)) {
    return 0;
  }
  const chance = (l.temperatura && CHANCES[l.etiqueta]?.[l.temperatura]) || CHANCE_PADRAO;
  // Em centavos, para 0.12 × 1440 não virar 172.79999999999998.
  return Math.round(valorCheio(l.horasEstimadas, precoHora) * chance * 100) / 100;
}
