/**
 * Leitura dos webhooks da Evolution API 2.3.7 para o formato normalizado de `tipos.ts`.
 *
 * Porta dos nós "Normalizar evento Evolution" (WF-01) e "Normalizar evento de saude"
 * (WF-07) de `docs/n8n-legado/`, conferida contra um evento real capturado em produção.
 * O campo `apikey` que a Evolution põe no envelope nunca sai daqui: não vai para
 * `detalhe`, log nem erro.
 */
import { paraE164 } from "../motor/telefone";
import type { EventoConexao, EventoMensagem, EventoNormalizado, TipoMidia } from "./tipos";

export type Obj = Record<string, unknown>;

export const obj = (v: unknown): Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
export const str = (v: unknown): string => (typeof v === "string" ? v : "");

type Envelope = { evento: string; instancia: string; itens: Obj[] };

function envelope(corpo: unknown): Envelope | null {
  const c = obj(corpo);
  if (Object.keys(c).length === 0) return null;
  const evento = String(c.event ?? "")
    .toLowerCase()
    .replace(/_/g, ".");
  const instancia = str(c.instance) || str(c.instanceName) || str(c.instanceId);
  const itens = (Array.isArray(c.data) ? c.data : c.data == null ? [] : [c.data]).map(obj);
  return { evento, instancia, itens };
}

// --- Mensagens (WF-01) ---

function desembrulhar(msg: Obj, nivel = 0): Obj {
  if (nivel > 5) return msg;
  for (const k of [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
    "editedMessage",
  ]) {
    if (msg[k]) return desembrulhar(obj(obj(msg[k]).message), nivel + 1);
  }
  return msg;
}

function extrairConteudo(bruta: unknown): { texto: string; tipo: TipoMidia } | null {
  const m = desembrulhar(obj(bruta));
  const sub = (k: string) => obj(m[k]);
  if (str(m.conversation).trim()) return { texto: str(m.conversation), tipo: "texto" };
  if (str(sub("extendedTextMessage").text))
    return { texto: str(sub("extendedTextMessage").text), tipo: "texto" };
  if (m.imageMessage)
    return { texto: str(sub("imageMessage").caption) || "[imagem]", tipo: "imagem" };
  if (m.videoMessage)
    return { texto: str(sub("videoMessage").caption) || "[video]", tipo: "video" };
  if (m.documentMessage) {
    const d = sub("documentMessage");
    const arq = str(d.fileName) ? " " + str(d.fileName) : "";
    return { texto: str(d.caption) || `[documento${arq}]`, tipo: "documento" };
  }
  if (m.audioMessage) return { texto: "[audio]", tipo: "audio" };
  if (m.stickerMessage) return { texto: "[figurinha]", tipo: "figurinha" };
  if (m.contactMessage || m.contactsArrayMessage) return { texto: "[contato]", tipo: "contato" };
  if (m.locationMessage || m.liveLocationMessage)
    return { texto: "[localizacao]", tipo: "localizacao" };
  const botao =
    str(sub("buttonsResponseMessage").selectedDisplayText) ||
    str(sub("templateButtonReplyMessage").selectedDisplayText);
  if (botao) return { texto: botao, tipo: "texto" };
  const lista = sub("listResponseMessage");
  if (lista.singleSelectReply) {
    const t = str(lista.title) || str(obj(lista.singleSelectReply).selectedRowId);
    if (t) return { texto: t, tipo: "texto" };
  }
  return null;
}

/** Segundos ou milissegundos (> 1e12); aceita também o `Long` do Baileys ({ low, high }). */
export function paraIso(valor: unknown, agora = () => new Date()): string {
  let v = valor;
  if (v !== null && typeof v === "object" && "low" in v) v = (v as { low: unknown }).low;
  if (v === null || v === undefined || v === "") return agora().toISOString();
  const s = String(v);
  const dt = /^\d+$/.test(s)
    ? new Date(Number(s) > 1e12 ? Number(s) : Number(s) * 1000)
    : new Date(s);
  return Number.isNaN(dt.getTime()) ? agora().toISOString() : dt.toISOString();
}

type Jid = { telefone: string } | { motivo: string; jid: string };

/** Resolve o JID para E.164, descartando grupo, status, canal e `@lid` sem número real. */
function resolverJid(jidBruto: string, chave: Obj, d: Obj): Jid {
  if (!jidBruto) return { motivo: "mensagem sem remoteJid", jid: "" };
  if (jidBruto.endsWith("@g.us")) return { motivo: "mensagem de grupo", jid: jidBruto };
  if (jidBruto.includes("broadcast") || jidBruto.endsWith("@newsletter"))
    return { motivo: "status ou canal", jid: jidBruto };
  let pessoa = jidBruto;
  if (jidBruto.endsWith("@lid")) {
    pessoa = str(chave.remoteJidAlt) || str(chave.senderPn) || str(d.remoteJidAlt);
    if (!pessoa) return { motivo: "jid @lid sem numero real", jid: jidBruto };
  }
  const telefone = paraE164(pessoa.split("@")[0].split(":")[0]);
  return telefone ? { telefone } : { motivo: "telefone invalido", jid: jidBruto };
}

function normalizarMensagem(d: Obj): EventoNormalizado {
  const chave = obj(d.key);
  const jid = resolverJid(str(chave.remoteJid), chave, d);
  if ("motivo" in jid) return { tipo: "ignorar", motivo: jid.motivo };
  const conteudo = extrairConteudo(d.message);
  if (!conteudo) return { tipo: "ignorar", motivo: "mensagem sem conteudo aproveitavel" };
  const daEquipe = chave.fromMe === true;
  const evento: EventoMensagem = {
    tipo: "mensagem",
    telefone: jid.telefone,
    nome: daEquipe ? null : str(d.pushName).slice(0, 120) || null,
    daEquipe,
    texto: conteudo.texto.slice(0, 4000),
    tipoMidia: conteudo.tipo,
    enviadaEm: paraIso(d.messageTimestamp),
    evolutionMsgId: str(chave.id),
  };
  return evento;
}

// --- Saúde (WF-07) ---

const NIVEIS: Record<string, 0 | 1 | 2 | 3 | 4 | 5> = {
  ERROR: 0,
  "0": 0,
  PENDING: 1,
  "1": 1,
  SERVER_ACK: 2,
  SERVER: 2,
  "2": 2,
  DELIVERY_ACK: 3,
  DELIVERED: 3,
  "3": 3,
  READ: 4,
  "4": 4,
  PLAYED: 5,
  "5": 5,
};

export function nivelDoAck(bruto: unknown): 0 | 1 | 2 | 3 | 4 | 5 | null {
  return NIVEIS[String(bruto ?? "").toUpperCase()] ?? null;
}

function normalizarAck(d: Obj): EventoNormalizado {
  const msgId = str(d.keyId) || str(obj(d.key).id) || str(d.messageId);
  const nivel = nivelDoAck(d.status !== undefined ? d.status : d.ack);
  if (!msgId || nivel === null)
    return { tipo: "ignorar", motivo: "ack sem id ou status conhecido" };
  return { tipo: "ack", evolutionMsgId: msgId, nivel };
}

const semApikey = (d: Obj): Obj => {
  const { apikey: _, ...resto } = d;
  return resto;
};

function normalizarConexao(evento: string, instancia: string, d: Obj): EventoNormalizado {
  const base = {
    tipo: "conexao" as const,
    instancia,
    evento,
    statusReason: null,
    qrPendente: false,
  };
  if (evento === "qrcode.updated") {
    // Sem o QR em si (base64 grande e sensível): só a tentativa.
    const e: EventoConexao = {
      ...base,
      estado: null,
      qrPendente: true,
      detalhe: { evento, tentativa: d.count ?? null },
    };
    return e;
  }
  if (evento === "logout.instance" || evento === "remove.instance")
    return { ...base, estado: "close", detalhe: { evento, bruto: semApikey(d) } };
  const s = str(d.state || d.connection).toLowerCase();
  if (s !== "open" && s !== "connecting" && s !== "close")
    return { tipo: "ignorar", motivo: "connection.update sem estado conhecido" };
  const razao = Number.parseInt(String(d.statusReason ?? d.reason ?? ""), 10);
  return {
    ...base,
    estado: s,
    statusReason: Number.isNaN(razao) ? null : razao,
    detalhe: { evento, bruto: semApikey(d) },
  };
}

const EVENTOS_CONEXAO = new Set([
  "connection.update",
  "application.startup",
  "qrcode.updated",
  "logout.instance",
  "remove.instance",
]);

export function normalizarEvolution(corpo: unknown): EventoNormalizado[] {
  const env = envelope(corpo);
  if (!env) return [{ tipo: "ignorar", motivo: "corpo invalido" }];
  const { evento, instancia, itens } = env;
  if (evento === "messages.upsert") {
    if (itens.length === 0) return [{ tipo: "ignorar", motivo: "payload sem data" }];
    return itens.map(normalizarMensagem);
  }
  if (evento === "messages.update" || evento === "messages.edited") {
    if (itens.length === 0) return [{ tipo: "ignorar", motivo: "ack sem data" }];
    return itens.map(normalizarAck);
  }
  if (EVENTOS_CONEXAO.has(evento)) {
    if (!instancia) return [{ tipo: "ignorar", motivo: "evento sem instancia" }];
    return [normalizarConexao(evento, instancia, itens[0] ?? {})];
  }
  return [{ tipo: "ignorar", motivo: "evento nao tratado: " + evento }];
}

/**
 * Mensagens e acks vão na fila da conversa (telefone E.164, ou o JID quando não há
 * número), para o ack nunca passar à frente da mensagem; eventos da instância, na fila
 * `instancia:<nome>`. Sem nada reconhecível, a chave única `evolution`.
 */
export function chaveDeOrdemDoCorpo(corpo: unknown): string | null {
  const env = envelope(corpo);
  if (!env) return null;
  const d = env.itens[0];
  if (d && env.evento.startsWith("messages.")) {
    const chave = obj(d.key);
    const jidBruto = str(chave.remoteJid) || str(d.remoteJid);
    const jid = resolverJid(jidBruto, chave, d);
    if ("telefone" in jid) return jid.telefone;
    if (jid.jid) return jid.jid;
  }
  if (env.instancia) return "instancia:" + env.instancia;
  return "evolution";
}
