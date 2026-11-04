// Regras puras do Pipeline (referência 04): colunas nas etapas do CRM, na ordem do
// funil do playbook, com soma de valor cheio e esperado. Função pura para o servidor
// montar as colunas e o teste conferir os totais.

export const ETAPAS = [
  "Novo Lead",
  "Atendimento",
  "Link enviado",
  "Aguardando pagamento",
  "Agendado",
  "Aula realizada",
  "Follow-up",
  "Negociação encerrada",
] as const;

type ComValor = { etiqueta: string; valorCheio: number; valorEsperado: number };

export type ColunaPipeline<T> = {
  etapa: (typeof ETAPAS)[number];
  quantidade: number;
  valorCheio: number;
  valorEsperado: number;
  cards: T[];
};

// Em centavos, para a soma de 0.1 + 0.2 não virar 0.30000000000000004.
const somar = (valores: number[]) => Math.round(valores.reduce((t, v) => t + v * 100, 0)) / 100;

export function agruparPorEtapa<T extends ComValor>(cards: T[]) {
  const colunas: ColunaPipeline<T>[] = ETAPAS.map((etapa) => {
    const daEtapa = cards.filter((c) => c.etiqueta === etapa);
    return {
      etapa,
      quantidade: daEtapa.length,
      valorCheio: somar(daEtapa.map((c) => c.valorCheio)),
      valorEsperado: somar(daEtapa.map((c) => c.valorEsperado)),
      cards: daEtapa,
    };
  });

  // Ativo = ainda pode virar venda; quem está fora (encerrado, opt-out, sem
  // atendimento, aula já passou) já sai de `valorEsperado` com 0.
  const ativos = colunas.flatMap((c) => c.cards).filter((c) => c.valorEsperado > 0);
  const valorCheio = somar(ativos.map((c) => c.valorCheio));
  const valorEsperado = somar(ativos.map((c) => c.valorEsperado));

  return {
    colunas,
    totais: {
      leadsAtivos: ativos.length,
      valorCheio,
      valorEsperado,
      probabilidade: valorCheio > 0 ? Math.round((valorEsperado / valorCheio) * 100) : 0,
    },
  };
}

/**
 * Preço da hora lido de `configuracoes.preco_hora`. Sem ele, o pipeline inteiro
 * mostraria R$ 0,00 como se fosse verdade; melhor falhar e a tela pedir a configuração.
 */
export function precoHoraDe(linha: { preco_hora: unknown } | undefined): number {
  const texto = String(linha?.preco_hora ?? "").trim();
  const preco = Number(texto);
  if (texto === "" || !Number.isFinite(preco)) {
    throw new Error("Preço da hora não configurado. Defina em Configurações.");
  }
  return preco;
}
