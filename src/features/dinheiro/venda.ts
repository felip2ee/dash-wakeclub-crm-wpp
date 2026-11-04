// Rótulos de venda compartilhados pela lista de /vendas e pelas vendas recentes.
import type { VendaLinha } from "@/server/vendas";

export const ROTULO_CATEGORIA: Record<string, string> = {
  "follow-up": "Follow-up",
  atendimento: "Atendimento",
  recompra: "Recompra",
  espontanea: "Espontânea",
};

/** Venda sem lead é "sem dono"; lead sem nome cai no telefone da venda. */
export const clienteDa = (v: VendaLinha) =>
  v.leadId ? (v.leadNome ?? v.telefone ?? "Lead sem nome") : "sem dono";
