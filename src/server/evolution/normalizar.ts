/**
 * Leitura dos webhooks da Evolution API 2.3.7 para o formato normalizado de `tipos.ts`.
 *
 * Porta dos nós "Normalizar evento Evolution" (WF-01) e "Normalizar evento de saude"
 * (WF-07) de `docs/n8n-legado/`, conferida contra um evento real capturado em produção.
 * O campo `apikey` que a Evolution põe no envelope nunca sai daqui: não vai para
 * `detalhe`, log nem erro.
 */
import { paraE164 } from "../motor/telefone";
import { origemDoContexto } from "./origem";
import type {
  EventoConexao,
  EventoMensagem,
  EventoNormalizado,
  OrigemLead,
  TipoMidia,
} from "./tipos";

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
  // Edição no formato do Baileys: `protocolMessage` (tipo MESSAGE_EDIT) com o novo conteúdo
  // em `editedMessage`, direto ou dentro de `editedMessage.message`.
  const editada = obj(obj(msg.protocolMessage).editedMessage);
  if (Object.keys(editada).length > 0) return desembrulhar(editada, nivel + 1);
  return msg;
}

/** Mídia: chaves do Baileys, tipo e marcador quando não há legenda (textos do WF-01). */
const MIDIAS: [string[], TipoMidia, (d: Obj) => string][] = [
  [["imageMessage"], "imagem", () => "[imagem]"],
  [["videoMessage"], "video", () => "[video]"],
  [
    ["documentMessage"],
    "documento",
    (d) => `[documento${str(d.fileName) ? " " + str(d.fileName) : ""}]`,
  ],
  [["audioMessage"], "audio", () => "[audio]"],
  [["stickerMessage"], "figurinha", () => "[figurinha]"],
  [["contactMessage", "contactsArrayMessage"], "contato", () => "[contato]"],
  [["locationMessage", "liveLocationMessage"], "localizacao", () => "[localizacao]"],
];

const LEGENDADAS = new Set<TipoMidia>(["imagem", "video", "documento"]);

/** Texto escolhido em botão ou lista. */
function respostaEscolhida(m: Obj): string {
  const lista = obj(m.listResponseMessage);
  return (
    str(obj(m.buttonsResponseMessage).selectedDisplayText) ||
    str(obj(m.templateButtonReplyMessage).selectedDisplayText) ||
    (lista.singleSelectReply
      ? str(lista.title) || str(obj(lista.singleSelectReply).selectedRowId)
      : "")
  );
}

function extrairConteudo(bruta: unknown): { texto: string; tipo: TipoMidia } | null {
  const m = desembrulhar(obj(bruta));
  const texto = str(m.conversation).trim()
    ? str(m.conversation)
    : str(obj(m.extendedTextMessage).text);
  if (texto) return { texto, tipo: "texto" };
  for (const [chaves, tipo, marcador] of MIDIAS) {
    const k = chaves.find((c) => m[c]);
    if (!k) continue;
    const d = obj(m[k]);
    return { texto: (LEGENDADAS.has(tipo) && str(d.caption)) || marcador(d), tipo };
  }
  const escolhida = respostaEscolhida(m);
  return escolhida ? { texto: escolhida, tipo: "texto" } : null;
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
    pessoa =
      str(chave.remoteJidAlt) || str(chave.senderPn) || str(d.remoteJidAlt) || str(d.senderPn);
    if (!pessoa) return { motivo: "jid @lid sem numero real", jid: jidBruto };
  }
  const telefone = paraE164(pessoa.split("@")[0].split(":")[0]);
  return telefone ? { telefone } : { motivo: "telefone invalido", jid: jidBruto };
}

/** Primeira origem em `data.contextInfo`, no `contextInfo` do conteúdo ou em `messageContextInfo`. */
function origemDaMensagem(d: Obj): OrigemLead | null {
  const msg = obj(d.message);
  const interna = desembrulhar(msg);
  const contextos = [
    d.contextInfo,
    ...Object.values(interna).map((v) => obj(v).contextInfo),
    msg.messageContextInfo,
    interna.messageContextInfo,
  ];
  for (const c of contextos) {
    const o = origemDoContexto(obj(c));
    if (o) return o;
  }
  return null;
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
    origem: origemDaMensagem(d),
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
 * número), para o ack nunca passar à frente da mensagem. O ack resolve o `@lid` pelos
 * mesmos campos da mensagem (`remoteJidAlt`/`senderPn`, na `key` ou no `data` plano); eventos da instância, na fila
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
