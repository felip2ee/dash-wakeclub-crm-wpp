/**
 * Mídia da conversa (design §5.3): imagem e vídeo abrem no app, áudio toca com a
 * transcrição embaixo, documento baixa. O CRM não guarda arquivo: cada pedido busca os
 * bytes na Evolution API pelo `evolution_msg_id`. A posse do lead segue a mesma regra do
 * envio (`podeEnviar`): admin vê tudo, atendente só os leads dela. Sem posse, 404, para
 * não revelar que a mensagem existe. O log leva só ids e status, nunca o conteúdo.
 */
import { z } from "zod";

import { getSessao, type Sessao } from "./auth";
import { type ClienteDb, getPoolMotor } from "./db";
import { obterAdaptador } from "./evolution";
import { logErro } from "./log";

export const LIMITE_MIDIA_BYTES = 25 * 1024 * 1024;

const TIPOS_MIDIA = ["audio", "imagem", "video", "documento", "figurinha"] as const;
type TipoMidia = (typeof TIPOS_MIDIA)[number];

const PREFIXO_MIME: Record<Exclude<TipoMidia, "documento">, string> = {
  audio: "audio/",
  imagem: "image/",
  video: "video/",
  figurinha: "image/",
};

type LinhaMidia = { tipo: TipoMidia; evolution_msg_id: string | null; texto: string | null };

/** Mensagem de mídia que a sessão pode ver; `null` se não existe, não é mídia ou não é dela. */
export async function lerMensagemMidia(
  db: Pick<ClienteDb, "query">,
  mensagemId: string,
  sessao: Pick<Sessao, "papel" | "usuarioId">,
): Promise<LinhaMidia | null> {
  const { rows } = await db.query<LinhaMidia>(
    `select m.tipo, m.evolution_msg_id, m.texto
       from wakeclub.mensagens m
       join wakeclub.leads l on l.id = m.lead_id
      where m.id = $1::uuid
        and m.tipo = any($2::text[])
        and ($3::boolean or l.atendente_id = $4::uuid)`,
    [mensagemId, TIPOS_MIDIA, sessao.papel === "admin", sessao.usuarioId],
  );
  return rows[0] ?? null;
}

/**
 * Nome do documento a partir do texto gravado (`[documento nome.pdf]`, ver normalizar).
 * Tira caminho, aspas, controle e o que quebraria o cabeçalho; `null` se não sobra nada.
 */
export function nomeArquivoSeguro(texto: string | null): string | null {
  const nome = /^\[documento (.+)\]$/s.exec(texto ?? "")?.[1];
  if (!nome) return null;
  const limpo = nome
    .replace(/^.*[\\/]/s, "")
    .replace(/[\p{Cc}"';<>*?|:]/gu, "")
    .trim()
    .slice(0, 120);
  return limpo && !/^\.+$/.test(limpo) ? limpo : null;
}

/**
 * Cabeçalhos da resposta. Só abre inline o que é do tipo esperado e não é SVG; o resto
 * baixa como binário, para um arquivo do lead nunca rodar como página na nossa origem.
 */
export function cabecalhosMidia(
  tipo: TipoMidia,
  mime: string,
  tamanho: number,
  nome: string | null,
): Headers {
  const inline =
    tipo !== "documento" && mime.startsWith(PREFIXO_MIME[tipo]) && mime !== "image/svg+xml";
  const arquivo = nome ?? "documento";
  const disposicao = inline
    ? "inline"
    : `attachment; filename="${arquivo.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(arquivo)}`;
  return new Headers({
    "Content-Type": inline || tipo === "documento" ? mime : "application/octet-stream",
    "Content-Length": String(tamanho),
    "Accept-Ranges": "bytes",
    "Content-Disposition": disposicao,
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
}

const erro = (status: number, mensagem: string) => Response.json({ erro: mensagem }, { status });
const naoEncontrado = () => erro(404, "Mídia indisponível");

export type Intervalo = { inicio: number; fim: number };

/**
 * Cabeçalho `Range` de um pedaço só (o iOS exige isso para tocar áudio e vídeo).
 * `null` = sem Range ou vários pedaços (resposta inteira, o que a RFC 9110 permite);
 * `"invalido"` = 416. `fim` é inclusivo.
 */
export function intervaloPedido(
  range: string | null,
  total: number,
): Intervalo | null | "invalido" {
  if (!range?.startsWith("bytes=") || range.includes(",")) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "invalido";
  if (m[1] === "") {
    const n = Number(m[2]);
    return n > 0 && total > 0 ? { inicio: Math.max(0, total - n), fim: total - 1 } : "invalido";
  }
  const inicio = Number(m[1]);
  const fim = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1);
  return inicio < total && inicio <= fim ? { inicio, fim } : "invalido";
}

export async function responderMidia(
  mensagemIdBruto: string,
  range: string | null,
  obterSessao: () => Promise<Pick<Sessao, "papel" | "usuarioId"> | null> = getSessao,
): Promise<Response> {
  const id = z.string().uuid().safeParse(mensagemIdBruto);
  if (!id.success) return naoEncontrado();
  try {
    return await servir(id.data, range, obterSessao);
  } catch (e) {
    logErro("midia.responder", e, { mensagemId: id.data });
    return erro(500, "Erro ao buscar a mídia");
  }
}

async function servir(
  mensagemId: string,
  range: string | null,
  obterSessao: () => Promise<Pick<Sessao, "papel" | "usuarioId"> | null>,
): Promise<Response> {
  const sessao = await obterSessao();
  if (!sessao) return erro(401, "Sessão expirada");

  const msg = await lerMensagemMidia(getPoolMotor(), mensagemId, sessao);
  if (!msg?.evolution_msg_id) return naoEncontrado();
  const adaptador = obterAdaptador();
  if (!adaptador) return erro(503, "Mídia indisponível no momento");

  let midia: Awaited<ReturnType<typeof adaptador.baixarMidia>>;
  try {
    midia = await adaptador.baixarMidia(msg.evolution_msg_id);
  } catch (e) {
    logErro("midia.baixar", e, { mensagemId });
    return erro(502, "Não foi possível buscar a mídia");
  }
  if (!midia) return naoEncontrado();
  const total = midia.dados.byteLength;
  if (total > LIMITE_MIDIA_BYTES) return erro(413, "Mídia acima de 25 MB");

  const pedaco = intervaloPedido(range, total);
  if (pedaco === "invalido") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
  }
  // O adaptador cria os bytes de um Buffer, sempre sobre ArrayBuffer.
  const dados = midia.dados as Uint8Array<ArrayBuffer>;
  const corpo = pedaco ? dados.subarray(pedaco.inicio, pedaco.fim + 1) : dados;
  const nome = msg.tipo === "documento" ? nomeArquivoSeguro(msg.texto) : null;
  const headers = cabecalhosMidia(msg.tipo, midia.mime, corpo.byteLength, nome);
  if (pedaco) headers.set("Content-Range", `bytes ${pedaco.inicio}-${pedaco.fim}/${total}`);
  return new Response(corpo, { status: pedaco ? 206 : 200, headers });
}
