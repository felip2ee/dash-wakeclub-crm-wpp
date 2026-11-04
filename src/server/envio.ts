/**
 * Envio de mensagem pelo app (design §5.3): valida, confere a posse do lead, manda pela
 * Evolution Go e grava a mensagem como `enviada_por = 'app'` com o autor. A lógica de
 * banco (`podeEnviar`, `gravarEnvio`) é separada das server functions para ser testável
 * sem cookie.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirSessao, type Sessao } from "./auth";
import { comTransacao, getPoolMotor, type PoolClient } from "./db";
import { obterAdaptador } from "./evolution";
import type { EventoMensagem } from "./evolution/tipos";
import { logErro } from "./log";

const MAX_BYTES = 16 * 1024 * 1024;

const MIME_DOCUMENTO = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const midia = (tipo: "imagem" | "video" | "documento" | "audio", mime: z.ZodType<string>) =>
  z.object({
    tipo: z.literal(tipo),
    // base64 ocupa 4 bytes para cada 3 decodificados.
    base64: z
      .string()
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .max((MAX_BYTES * 4) / 3 + 4, "Arquivo acima de 16 MB."),
    mime,
    nomeArquivo: z.string().max(200).optional(),
    legenda: z.string().max(1000).optional(),
  });

const prefixo = (p: string) =>
  z
    .string()
    .max(100)
    .regex(new RegExp(`^${p}/`));

export const schemaEnvio = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("texto"), texto: z.string().min(1).max(4000) }),
  midia("imagem", prefixo("image")),
  midia("video", prefixo("video")),
  midia(
    "documento",
    z.string().refine((m) => MIME_DOCUMENTO.includes(m), "Tipo não permitido."),
  ),
  midia("audio", prefixo("audio")),
  z.object({
    tipo: z.literal("localizacao"),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    nome: z.string().max(200).optional(),
  }),
]);

type EnvioApp = z.infer<typeof schemaEnvio>;

/**
 * Telefone do lead se a sessão pode escrever para ele; `null` se não pode. Opt-out não
 * barra: envio pelo app é humano respondendo, e o opt-out proíbe follow-up (design §5.3).
 */
export async function podeEnviar(
  db: Pick<PoolClient, "query">,
  leadId: string,
  sessao: Sessao,
): Promise<{ telefone: string } | null> {
  const { rows } = await db.query<{ telefone: string }>(
    `select telefone from wakeclub.leads
      where id = $1::uuid
        and ($2::boolean or atendente_id = $3::uuid)`,
    [leadId, sessao.papel === "admin", sessao.usuarioId],
  );
  return rows[0] ?? null;
}

/** Texto gravado, igual ao `extrairTexto` do WF-01: legenda ou `[tipo]`. */
function textoDoEnvio(envio: EnvioApp): string {
  switch (envio.tipo) {
    case "texto":
      return envio.texto;
    case "audio":
      return "[audio]";
    case "localizacao":
      return "[localizacao]";
    case "documento":
      return envio.legenda || `[documento${envio.nomeArquivo ? ` ${envio.nomeArquivo}` : ""}]`;
    default:
      return envio.legenda || `[${envio.tipo}]`;
  }
}

/** Grava o que foi enviado; se o eco da Evolution chegou antes, a linha vira do app. */
export async function gravarEnvio(
  db: PoolClient,
  telefone: string,
  envio: EnvioApp,
  enviada: { evolutionMsgId: string; usuarioId: string },
) {
  const evento: EventoMensagem = {
    tipo: "mensagem",
    telefone,
    nome: null,
    daEquipe: true,
    texto: textoDoEnvio(envio),
    tipoMidia: envio.tipo,
    enviadaEm: new Date().toISOString(),
    evolutionMsgId: enviada.evolutionMsgId,
  };
  // Import dinâmico: no dev o Vite não faz tree-shaking e um import estático levaria
  // o motor (e o `pg`) ao bundle do navegador.
  const { registrarMensagem } = await import("./motor/ingestao");
  return registrarMensagem(db, evento, { usuarioId: enviada.usuarioId });
}

export const envioDisponivel = createServerFn({ method: "GET" }).handler(async () => {
  await exigirSessao();
  return obterAdaptador() !== null;
});

export const enviarMensagem = createServerFn({ method: "POST" })
  .validator(z.object({ leadId: z.string().uuid(), envio: schemaEnvio }))
  .handler(async ({ data }): Promise<{ mensagemId: string }> => {
    const sessao = await exigirSessao();
    const adaptador = obterAdaptador();
    if (!adaptador) throw new Error("Envio indisponível");
    const lead = await podeEnviar(getPoolMotor(), data.leadId, sessao);
    if (!lead) throw new Error("Lead indisponível para envio");
    const { evolutionMsgId } = await adaptador.enviar({ telefone: lead.telefone, ...data.envio });
    let mensagemId: string | null;
    try {
      const r = await comTransacao((c) =>
        gravarEnvio(c, lead.telefone, data.envio, { evolutionMsgId, usuarioId: sessao.usuarioId }),
      );
      mensagemId = r.mensagemId;
    } catch (erro) {
      logErro("envio.registro", erro, { evolutionMsgId });
      mensagemId = null;
    }
    if (!mensagemId) throw new Error("Mensagem enviada, mas não registrada no CRM. Não reenvie.");
    return { mensagemId };
  });
