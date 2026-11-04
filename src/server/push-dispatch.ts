/**
 * Entrega Web Push server-only.
 *
 * Este módulo não gerencia a fila `notificacoes`: ele recebe um payload já
 * decidido pelo n8n e tenta entregá-lo a cada aparelho, isolando as falhas.
 */
import { getPoolRw } from "./db";

export type PayloadPush = {
  usuarioId: string | null;
  titulo: string;
  corpo?: string;
  url?: string;
  tag?: string;
  /** Pede ao service worker que não mostre o aviso se o app estiver visível. */
  seAppFechado?: boolean;
};

export type ResultadoPush = { enviados: number; removidos: number; falhas: number };

type Inscricao = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function entregarPush(payload: PayloadPush): Promise<ResultadoPush> {
  const chavePublica = process.env.VITE_VAPID_PUBLIC_KEY;
  const chavePrivada = process.env.VAPID_PRIVATE_KEY;
  if (!chavePublica || !chavePrivada) {
    throw new Error("Chaves VAPID não configuradas no servidor.");
  }

  const { default: webpush } = await import("web-push");
  webpush.setVapidDetails("https://wakeclub.com.br", chavePublica, chavePrivada);

  const parametros = payload.usuarioId ? [payload.usuarioId] : [];
  const filtro = payload.usuarioId
    ? "p.usuario_id = $1::uuid and u.ativo = true"
    : "u.papel = 'admin' and u.ativo = true";
  const { rows } = await getPoolRw().query<Inscricao>(
    `select p.id, p.endpoint, p.p256dh, p.auth
       from wakeclub.push_subscriptions p
       join wakeclub.usuarios u on u.id = p.usuario_id
      where ${filtro}`,
    parametros,
  );

  const resultado: ResultadoPush = { enviados: 0, removidos: 0, falhas: 0 };
  const corpo = JSON.stringify({
    titulo: payload.titulo,
    corpo: payload.corpo ?? "",
    // Compatibilidade enquanto o WF-09 ainda publica a rota antiga.
    url: payload.url === "/followups" ? "/minha-fila" : (payload.url ?? "/minha-fila"),
    tag: payload.tag,
    seAppFechado: payload.seAppFechado ?? false,
  });

  for (const inscricao of rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: inscricao.endpoint,
          keys: { p256dh: inscricao.p256dh, auth: inscricao.auth },
        },
        corpo,
      );
      resultado.enviados += 1;
      await getPoolRw().query(
        `update wakeclub.push_subscriptions
            set usado_em = now(), falhas = 0, ultimo_erro = null
          where id = $1::uuid`,
        [inscricao.id],
      );
    } catch (erro) {
      const statusCode = statusDoErro(erro);
      if (statusCode === 404 || statusCode === 410) {
        await getPoolRw().query("delete from wakeclub.push_subscriptions where id = $1::uuid", [
          inscricao.id,
        ]);
        resultado.removidos += 1;
        continue;
      }

      await getPoolRw().query(
        `update wakeclub.push_subscriptions
            set falhas = falhas + 1, ultimo_erro = $2::text
          where id = $1::uuid`,
        [inscricao.id, mensagemDoErro(erro)],
      );
      resultado.falhas += 1;
    }
  }

  return resultado;
}

function statusDoErro(erro: unknown) {
  if (typeof erro === "object" && erro && "statusCode" in erro) {
    const status = Number((erro as { statusCode: unknown }).statusCode);
    return Number.isFinite(status) ? status : null;
  }
  return null;
}

function mensagemDoErro(erro: unknown) {
  const mensagem = erro instanceof Error ? erro.message : "Falha desconhecida no provedor push";
  return mensagem.slice(0, 500);
}
