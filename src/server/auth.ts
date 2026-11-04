/**
 * Autenticação server-only do painel.
 *
 * A senha é conferida apenas aqui. O navegador recebe um token aleatório e o
 * banco guarda somente seu SHA-256, impedindo que uma leitura de `sessoes`
 * permita assumir a identidade de alguém.
 */
import { createHash, randomBytes } from "node:crypto";

import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import { getPool, getPoolRw } from "./db";

const COOKIE_SESSAO = "wc_sessao";
const DURACAO_SESSAO_SEGUNDOS = 60 * 60 * 24 * 30;
const JANELA_TENTATIVAS_MS = 5 * 60 * 1_000;
const MAX_TENTATIVAS = 10;
const HASH_USUARIO_INEXISTENTE = "$2b$12$Ba/ONNhxiMZuX2E.olR0uO3Nmd7WUvYOnVtzm69Q6V4vodWV5vy9i";

type Papel = "admin" | "atendente";

export type Sessao = {
  usuarioId: string;
  nome: string;
  usuario: string;
  papel: Papel;
  labelId: string | null;
};

type Tentativas = { inicioEm: number; quantidade: number };

declare global {
  var __wakeclubTentativasLogin: Map<string, Tentativas> | undefined;
}

const tentativasLogin =
  globalThis.__wakeclubTentativasLogin ??
  (globalThis.__wakeclubTentativasLogin = new Map<string, Tentativas>());

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function cookieSeguro() {
  return process.env.NODE_ENV === "production";
}

function estaBloqueado(usuario: string, agora: number) {
  const tentativa = tentativasLogin.get(usuario);
  if (!tentativa) return false;
  if (agora - tentativa.inicioEm >= JANELA_TENTATIVAS_MS) {
    tentativasLogin.delete(usuario);
    return false;
  }
  return tentativa.quantidade >= MAX_TENTATIVAS;
}

function registrarFalha(usuario: string, agora: number) {
  const tentativa = tentativasLogin.get(usuario);
  if (!tentativa || agora - tentativa.inicioEm >= JANELA_TENTATIVAS_MS) {
    tentativasLogin.set(usuario, { inicioEm: agora, quantidade: 1 });
    return;
  }
  tentativa.quantidade += 1;
}

export const entrar = createServerFn({ method: "POST" })
  .validator(
    z.object({
      usuario: z.string().trim().min(1).max(100),
      senha: z.string().min(1).max(200),
    }),
  )
  .handler(async ({ data }): Promise<{ sessao: Sessao } | { erro: string }> => {
    const { default: bcrypt } = await import("bcryptjs");
    const usuario = data.usuario.trim().toLowerCase();
    const agora = Date.now();

    if (estaBloqueado(usuario, agora)) {
      return { erro: "Muitas tentativas. Aguarde 5 minutos e tente novamente." };
    }

    const { rows } = await getPoolRw().query(
      `select id, nome, usuario, senha_hash, papel, label_id
         from wakeclub.usuarios
        where usuario = $1::text and ativo = true
        limit 1`,
      [usuario],
    );
    const registro = rows[0];
    const senhaCorreta = await bcrypt.compare(
      data.senha,
      registro?.senha_hash ?? HASH_USUARIO_INEXISTENTE,
    );

    if (!registro || !senhaCorreta) {
      registrarFalha(usuario, agora);
      return { erro: "Usuário ou senha incorretos." };
    }

    tentativasLogin.delete(usuario);

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const userAgent = getRequestHeader("user-agent")?.slice(0, 500) ?? null;

    const cliente = await getPoolRw().connect();
    try {
      await cliente.query("begin");
      await cliente.query(
        `insert into wakeclub.sessoes (usuario_id, token_hash, expira_em, user_agent, usado_em)
         values ($1::uuid, $2::text, now() + interval '30 days', $3::text, now())`,
        [registro.id, tokenHash, userAgent],
      );
      await cliente.query(
        "update wakeclub.usuarios set ultimo_acesso_em = now() where id = $1::uuid",
        [registro.id],
      );
      await cliente.query("commit");
    } catch (erro) {
      await cliente.query("rollback");
      throw erro;
    } finally {
      cliente.release();
    }

    setCookie(COOKIE_SESSAO, token, {
      httpOnly: true,
      secure: cookieSeguro(),
      sameSite: "lax",
      path: "/",
      maxAge: DURACAO_SESSAO_SEGUNDOS,
    });

    return {
      sessao: {
        usuarioId: registro.id,
        nome: registro.nome,
        usuario: registro.usuario,
        papel: registro.papel,
        labelId: registro.label_id,
      },
    };
  });

export const getSessao = createServerFn({ method: "GET" }).handler(
  async (): Promise<Sessao | null> => {
    const token = getCookie(COOKIE_SESSAO);
    if (!token) return null;

    const tokenHash = hashToken(token);
    const { rows } = await getPool().query(
      `select usuario_id, nome, usuario, papel, label_id
         from wakeclub.v_sessao_valida
        where token_hash = $1::text
        limit 1`,
      [tokenHash],
    );
    const registro = rows[0];

    if (!registro) {
      deleteCookie(COOKIE_SESSAO, { path: "/", secure: cookieSeguro(), sameSite: "lax" });
      return null;
    }

    await getPoolRw().query(
      `update wakeclub.sessoes
          set usado_em = now()
        where token_hash = $1::text
          and (usado_em is null or usado_em < now() - interval '1 hour')`,
      [tokenHash],
    );

    return {
      usuarioId: registro.usuario_id,
      nome: registro.nome,
      usuario: registro.usuario,
      papel: registro.papel,
      labelId: registro.label_id,
    };
  },
);

export const sair = createServerFn({ method: "POST" }).handler(async (): Promise<void> => {
  const token = getCookie(COOKIE_SESSAO);
  if (token) {
    await getPoolRw().query(
      "update wakeclub.sessoes set revogada = true where token_hash = $1::text",
      [hashToken(token)],
    );
  }
  deleteCookie(COOKIE_SESSAO, { path: "/", secure: cookieSeguro(), sameSite: "lax" });
});

export const exigirSessao = createServerFn({ method: "GET" }).handler(async (): Promise<Sessao> => {
  const sessao = await getSessao();
  if (!sessao) throw redirect({ to: "/login" });
  return sessao;
});

export const exigirAdmin = createServerFn({ method: "GET" }).handler(async (): Promise<Sessao> => {
  const sessao = await getSessao();
  if (!sessao) throw redirect({ to: "/login" });
  if (sessao.papel !== "admin") throw redirect({ to: "/inicio" });
  return sessao;
});

export const exigirAtendente = createServerFn({ method: "GET" }).handler(
  async (): Promise<Sessao> => {
    const sessao = await getSessao();
    if (!sessao) throw redirect({ to: "/login" });
    if (sessao.papel !== "atendente") throw redirect({ to: "/visao-geral" });
    return sessao;
  },
);
