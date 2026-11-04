export type Categoria = "follow-up" | "atendimento" | "recompra" | "espontanea";

const JANELA_MS = 48 * 3600_000;

/** Interação cai na janela [compra - 48h, compra]. */
function naJanela(quando: Date | null, compra: Date): quando is Date {
  if (!quando) return false;
  const delta = compra.getTime() - quando.getTime();
  return delta >= 0 && delta <= JANELA_MS;
}

/** Categoria da venda (spec fase 4 §4). O chamador troca o motivo pelo id do follow-up/mensagem. */
export function categoriaDaVenda(i: {
  compradaEm: Date;
  followupEnviadoEm: Date | null;
  mensagemEquipeEm: Date | null;
  tinhaVendaAnterior: boolean;
}): { categoria: Categoria; motivo: string } {
  if (naJanela(i.followupEnviadoEm, i.compradaEm)) {
    return { categoria: "follow-up", motivo: "follow-up enviado nas 48h antes da compra" };
  }
  if (naJanela(i.mensagemEquipeEm, i.compradaEm)) {
    return { categoria: "atendimento", motivo: "mensagem da equipe nas 48h antes da compra" };
  }
  if (i.tinhaVendaAnterior) {
    return { categoria: "recompra", motivo: "sem interação nas 48h; lead já tinha venda paga" };
  }
  return { categoria: "espontanea", motivo: "sem interação nas 48h e sem venda anterior" };
}

/** Comissão em reais: só follow-up e atendimento pagam. */
export function comissaoDaVenda(valor: number, pct: number, categoria: Categoria): number {
  if (categoria !== "follow-up" && categoria !== "atendimento") return 0;
  // Em centavos inteiros; meio centavo sobe.
  return Math.round((Math.round(valor * 100) * pct) / 100) / 100;
}
