// Linha do tempo da conversa (referência 01, direita): chips só com fatos que existem no
// banco. Compra vem das vendas pagas do lead (webhook, fase 4).

/** Evento de `eventos_automacao` como o servidor entrega (`getLinhaDoTempo`). */
export type EventoLinha = {
  tipo: string;
  ocorridoEm: string;
  /** Etiqueta anterior/nova, só em `stage_changed`. */
  de: string | null;
  para: string | null;
};

/** Venda paga do lead como o servidor entrega (`getLinhaDoTempo`). */
export type CompraLinha = { compradaEm: string; produto: string | null; horas: number | null };

export type ChipLinha = {
  chave: string;
  tipo: "cadastro" | "etapa" | "followup" | "compra";
  rotulo: string;
  quando: string;
};

export function montarLinhaDoTempo(
  criadoEm: string,
  eventos: EventoLinha[],
  compras: CompraLinha[] = [],
): ChipLinha[] {
  const chips: ChipLinha[] = [];
  for (const [i, e] of eventos.entries()) {
    const chave = `${e.tipo}-${i}`;
    if (e.tipo === "stage_changed" && e.para) {
      const rotulo = e.de ? `Etapa: ${e.de} → ${e.para}` : `Etapa: ${e.para}`;
      chips.push({ chave, tipo: "etapa", rotulo, quando: e.ocorridoEm });
    }
    if (e.tipo === "followup_sent") {
      chips.push({ chave, tipo: "followup", rotulo: "Follow-up enviado", quando: e.ocorridoEm });
    }
  }
  for (const [i, c] of compras.entries()) {
    const detalhe = c.produto ?? (c.horas === null ? null : `${c.horas} h`);
    chips.push({
      chave: `compra-${i}`,
      tipo: "compra",
      rotulo: detalhe ? `Compra · ${detalhe}` : "Compra",
      quando: c.compradaEm,
    });
  }
  chips.sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando));
  return [
    { chave: "cadastro", tipo: "cadastro", rotulo: "Cadastro realizado", quando: criadoEm },
    ...chips,
  ];
}

const FUSO = "America/Sao_Paulo";

function partes(iso: string, opcoes: Intl.DateTimeFormatOptions): Record<string, string> {
  const r: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, ...opcoes }).formatToParts(
    new Date(iso),
  )) {
    r[p.type] = p.value.replace(".", "");
  }
  return r;
}

/** Separador de dia: "Ter, 20 de jan". */
export function rotuloDia(iso: string): string {
  const p = partes(iso, { weekday: "short", day: "numeric", month: "short" });
  return `${p.weekday.charAt(0).toUpperCase()}${p.weekday.slice(1)}, ${p.day} de ${p.month}`;
}

/** Data do chip da linha do tempo: "12 jan, 10:24". */
export function dataDoChip(iso: string): string {
  const p = partes(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `${p.day} ${p.month}, ${p.hour}:${p.minute}`;
}

const ROTULO_AUDIO: Record<string, string> = {
  pendente: "Transcrevendo…",
  transcrevendo: "Transcrevendo…",
  falhou: "Não foi possível transcrever",
  sem_midia: "Áudio indisponível",
};

/**
 * Rótulo do áudio pelo status da transcrição; `null` = "ok", mostre o texto (que é a
 * transcrição). Fora do "ok" o texto pode ser placeholder do WhatsApp e nunca aparece.
 */
export function rotuloAudio(status: string | null): string | null {
  if (status === "ok") return null;
  return ROTULO_AUDIO[status ?? ""] ?? "Áudio";
}

/** Texto que o WhatsApp grava no lugar da legenda (ver `normalizar.ts`); não é legenda. */
const MARCADOR = /^\[(imagem|video|figurinha|audio|documento)( .*)?\]$/s;

/** Legenda de verdade da mensagem de mídia, sem os marcadores `[imagem]`, `[documento x]`. */
export function legendaDaMidia(texto: string | null): string | null {
  return texto && !MARCADOR.test(texto) ? texto : null;
}

/** Nome do documento quando o texto é o marcador `[documento nome.pdf]`. */
export function nomeDoDocumento(texto: string | null): string | null {
  return /^\[documento (.+)\]$/s.exec(texto ?? "")?.[1] ?? null;
}
