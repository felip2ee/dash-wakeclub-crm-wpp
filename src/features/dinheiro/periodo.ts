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
