import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import type { Autoria } from "@/server/conversas";

/**
 * Formatação em pt-BR, num lugar só.
 *
 * O fuso é fixado em America/Sao_Paulo de propósito: é o mesmo que o SQL do
 * projeto usa (ver §7.1 do CLAUDE.md). Deixar o navegador decidir faria o
 * painel mostrar um horário e o banco outro para quem abrisse de fora do país.
 */

const FUSO = "America/Sao_Paulo";

/** 2026-07-28T14:30:00Z → 28/07 11:30 */
export function dataHora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO,
  });
}

/** 2026-07-28T14:30:00Z → 28/07/2026 11:30 */
export function dataHoraCompleta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO,
  });
}

/** 2026-07-28T14:30:00Z → 11:30 */
export function hora(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO,
  });
}

/** 2026-07-28 → 28/07 (as views de relatório devolvem data pura) */
export function diaCurto(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}`;
}

/** Separador de dia dentro da thread: "hoje", "ontem" ou "28/07/2026". */
export function diaRelativo(iso: string): string {
  const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: FUSO, dateStyle: "short" });

  const alvo = dia(new Date(iso));
  const hoje = dia(new Date());
  const ontem = dia(new Date(Date.now() - 86_400_000));

  if (alvo === hoje) return "hoje";
  if (alvo === ontem) return "ontem";
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** "há 2 horas" / "em 3 dias" */
export function desde(iso: string | null): string {
  if (!iso) return "—";
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
}

/** +5563981119636 → +55 63 98111-9636 */
export function telefone(e164: string): string {
  const m = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : e164;
}

/** Iniciais para o avatar. "Marina Alves" → "MA" */
export function iniciais(nome: string | null, fallback = "?"): string {
  if (!nome?.trim()) return fallback;
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

/** Plural simples: 1 lead / 2 leads */
export function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/** Quem mandou a mensagem da equipe, só para leitura no app (design §5.2). */
export function rotuloAutoria(a: Autoria): string {
  if (a === null) return "Equipe";
  return a.tipo === "app" ? a.nome : "enviado pelo ADM";
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 1234.5 → R$ 1.234,50 */
export function moeda(valor: number): string {
  return BRL.format(valor);
}
