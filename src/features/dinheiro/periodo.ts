// Datas das telas de dinheiro no fuso do SQL (America/Sao_Paulo), como `src/lib/formato.ts`.

/** Dia `AAAA-MM-DD` em São Paulo; `en-CA` já formata assim. */
export function diaSP(agora = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Do dia 1 do mês até hoje, em São Paulo. */
export function mesCorrente(agora = new Date()): { de: string; ate: string } {
  const hoje = diaSP(agora);
  return { de: `${hoje.slice(0, 8)}01`, ate: hoje };
}

/** `2026-01` → `2025-12`. */
export function mesAnterior(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, "0")}`;
}

/** `2026-03` → `03/2026`. */
export function rotuloMes(mes: string): string {
  return `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
}

export type Periodo = { de: string; ate: string };
export type Atalho = "hoje" | "7dias" | "mes" | "personalizado";

/** Só o dia de hoje em São Paulo. */
export function hoje(agora = new Date()): Periodo {
  const d = diaSP(agora);
  return { de: d, ate: d };
}

/** Hoje e os 6 dias anteriores, em São Paulo. */
export function ultimos7Dias(agora = new Date()): Periodo {
  const ate = diaSP(agora);
  const de = new Date(`${ate}T00:00:00Z`);
  de.setUTCDate(de.getUTCDate() - 6);
  return { de: de.toISOString().slice(0, 10), ate };
}

/** Atalho cujo período bate exatamente com `p`; senão "personalizado". */
export function atalhoDe(p: Periodo, agora = new Date()): Atalho {
  const igual = (o: Periodo) => o.de === p.de && o.ate === p.ate;
  if (igual(hoje(agora))) return "hoje";
  if (igual(ultimos7Dias(agora))) return "7dias";
  if (igual(mesCorrente(agora))) return "mes";
  return "personalizado";
}
