/**
 * Administração server-only da equipe.
 *
 * Centraliza métricas e as poucas escritas permitidas ao admin: ativar uma
 * atendente, remover uma inscrição Web Push e disparar um push de teste.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAdmin } from "./auth";
import { comTransacao, getPool, getPoolRw } from "./db";
import { redistribuirSoltos, soltarDeInativos } from "./motor/distribuicao";

export type ResumoAdmin = {
  filaAgora: number;
  parados2h: number;
  sugeridos7d: number;
  tocados7d: number;
  taxaToque7d: number | null;
  medianaMinAteToque: number | null;
  toqueSemEco7d: number;
  abortados7d: number;
  semAtendimento: number;
  semDona: number;
};

export type AparelhoAdmin = {
  id: string;
  usuarioId: string;
  apelido: string | null;
  falhas: number;
  ultimoErro: string | null;
  criadoEm: string;
  usadoEm: string | null;
};

export type AtendenteAdmin = {
  usuarioId: string;
  nome: string;
  usuario: string;
  ativo: boolean;
  ultimoAcessoEm: string | null;
  labelId: string | null;
  peso: number;
  comissaoPct: number;
  naFila: number;
  vencidos: number;
  parados2h: number;
  leadsAtivos: number;
  sugeridos7d: number;
  tocados7d: number;
  taxaToque7d: number | null;
  medianaMinAteToque: number | null;
  aparelhos: AparelhoAdmin[];
};

export type LabelDisponivelAdmin = { labelId: string; nome: string; cor: string | null };

export type PainelAdmin = {
  resumo: ResumoAdmin;
  atendentes: AtendenteAdmin[];
  labelsDisponiveis: LabelDisponivelAdmin[];
};

const iso = (data: Date | null) => (data ? data.toISOString() : null);
const numeroOuNulo = (valor: unknown) => (valor === null ? null : Number(valor));

export const getPainelAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<PainelAdmin> => {
    await exigirAdmin();

    const [
      resumoResultado,
      atendentesResultado,
      aparelhosResultado,
      labelsResultado,
      pesosResultado,
    ] = await Promise.all([
      getPool().query("select * from wakeclub.v_admin_resumo"),
      getPool().query(
        `select *
           from wakeclub.v_admin_atendentes
          order by parados_2h desc, nome asc`,
      ),
      getPoolRw().query(
        `select id, usuario_id, apelido, falhas, ultimo_erro, criado_em, usado_em
           from wakeclub.push_subscriptions
          order by criado_em desc`,
      ),
      getPool().query(
        `select label_id, nome, cor
           from wakeclub.v_admin_labels_disponiveis
          order by nome asc`,
      ),
      getPoolRw().query("select id, peso, comissao_pct from wakeclub.usuarios"),
    ]);
    const pesos = new Map(pesosResultado.rows.map((r) => [r.id, r]));

    const resumo = resumoResultado.rows[0];
    if (!resumo) throw new Error("A view administrativa não devolveu o resumo da equipe.");

    const aparelhos = aparelhosResultado.rows.map(
      (registro): AparelhoAdmin => ({
        id: registro.id,
        usuarioId: registro.usuario_id,
        apelido: registro.apelido,
        falhas: Number(registro.falhas ?? 0),
        ultimoErro: registro.ultimo_erro,
        criadoEm: registro.criado_em.toISOString(),
        usadoEm: iso(registro.usado_em),
      }),
    );

    return {
      resumo: {
        filaAgora: Number(resumo.fila_agora ?? 0),
        parados2h: Number(resumo.parados_2h ?? 0),
        sugeridos7d: Number(resumo.sugeridos_7d ?? 0),
        tocados7d: Number(resumo.tocados_7d ?? 0),
        taxaToque7d: numeroOuNulo(resumo.taxa_toque_7d),
        medianaMinAteToque: numeroOuNulo(resumo.mediana_min_ate_toque),
        toqueSemEco7d: Number(resumo.toque_sem_eco_7d ?? 0),
        abortados7d: Number(resumo.abortados_7d ?? 0),
        semAtendimento: Number(resumo.sem_atendimento ?? 0),
        semDona: Number(resumo.sem_dona ?? 0),
      },
      atendentes: atendentesResultado.rows.map(
        (registro): AtendenteAdmin => ({
          usuarioId: registro.usuario_id,
          nome: registro.nome,
          usuario: registro.usuario,
          ativo: registro.ativo,
          ultimoAcessoEm: iso(registro.ultimo_acesso_em),
          labelId: registro.label_id,
          peso: Number(pesos.get(registro.usuario_id)?.peso ?? 1),
          comissaoPct: Number(pesos.get(registro.usuario_id)?.comissao_pct ?? 0),
          naFila: Number(registro.na_fila ?? 0),
          vencidos: Number(registro.vencidos ?? 0),
          parados2h: Number(registro.parados_2h ?? 0),
          leadsAtivos: Number(registro.leads_ativos ?? 0),
          sugeridos7d: Number(registro.sugeridos_7d ?? 0),
          tocados7d: Number(registro.tocados_7d ?? 0),
          taxaToque7d: numeroOuNulo(registro.taxa_toque_7d),
          medianaMinAteToque: numeroOuNulo(registro.mediana_min_ate_toque),
          aparelhos: aparelhos.filter((aparelho) => aparelho.usuarioId === registro.usuario_id),
        }),
      ),
      labelsDisponiveis: labelsResultado.rows.map((registro) => ({
        labelId: registro.label_id,
        nome: registro.nome,
        cor: registro.cor,
      })),
    };
  },
);

const alterarAtendenteSchema = z.object({
  usuarioId: z.string().uuid(),
  ativo: z.boolean(),
});

export const alterarAtendente = createServerFn({ method: "POST" })
  .validator(alterarAtendenteSchema)
  .handler(async ({ data }): Promise<{ alterado: true }> => {
    await exigirAdmin();
    const { rowCount } = await getPoolRw().query(
      `update wakeclub.usuarios
          set ativo = $2::boolean
        where id = $1::uuid
          and papel = 'atendente'`,
      [data.usuarioId, data.ativo],
    );
    if (rowCount !== 1) throw new Error("Atendente não encontrada.");
    // Quem sai do rodízio devolve os leads na mesma requisição.
    if (!data.ativo)
      await comTransacao((c) => soltarDeInativos(c).then(() => redistribuirSoltos(c)));
    return { alterado: true };
  });

const criarAtendenteSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  usuario: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9._-]+$/, "Use apenas letras sem acento, números, ponto, hífen ou sublinhado."),
  senha: z.string().min(8).max(200),
  labelId: z.string().trim().min(1).max(100).optional(),
  peso: z.number().int().min(0).max(10).default(1),
  comissaoPct: z.number().min(0).max(100).default(0),
});

export const criarAtendente = createServerFn({ method: "POST" })
  .validator(criarAtendenteSchema)
  .handler(async ({ data }): Promise<{ criado: true }> => {
    await exigirAdmin();

    if (data.labelId) {
      const label = await getPool().query(
        `select 1
           from wakeclub.v_admin_labels_disponiveis
          where label_id = $1::text
          limit 1`,
        [data.labelId],
      );
      if (!label.rows[0]) throw new Error("A label não está disponível para uma nova atendente.");
    }

    const { default: bcrypt } = await import("bcryptjs");
    const senhaHash = await bcrypt.hash(data.senha, 12);

    try {
      await getPoolRw().query(
        `insert into wakeclub.usuarios
           (nome, usuario, senha_hash, label_id, peso, comissao_pct)
         values ($1::text, $2::text, $3::text, $4::text, $5::smallint, $6::numeric)`,
        [data.nome, data.usuario, senhaHash, data.labelId ?? null, data.peso, data.comissaoPct],
      );
    } catch (erro) {
      if (typeof erro === "object" && erro && "code" in erro && erro.code === "23505") {
        throw new Error("Este usuário ou esta label já está em uso.");
      }
      throw erro;
    }

    return { criado: true };
  });

export const removerAparelho = createServerFn({ method: "POST" })
  .validator(z.object({ aparelhoId: z.string().uuid() }))
  .handler(async ({ data }): Promise<{ removido: true }> => {
    await exigirAdmin();
    const { rowCount } = await getPoolRw().query(
      "delete from wakeclub.push_subscriptions where id = $1::uuid",
      [data.aparelhoId],
    );
    if (rowCount !== 1) throw new Error("Aparelho não encontrado.");
    return { removido: true };
  });

export const testarNotificacaoDaAtendente = createServerFn({ method: "POST" })
  .validator(z.object({ usuarioId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const admin = await exigirAdmin();
    const { rows } = await getPoolRw().query(
      `select nome
         from wakeclub.usuarios
        where id = $1::uuid and papel = 'atendente'
        limit 1`,
      [data.usuarioId],
    );
    if (!rows[0]) throw new Error("Atendente não encontrada.");

    const { entregarPush } = await import("./push-dispatch");
    return entregarPush({
      usuarioId: data.usuarioId,
      titulo: "Teste da Wake Club",
      corpo: `${admin.nome} enviou uma notificação de teste para ${rows[0].nome}.`,
      url: "/minha-fila",
      tag: `teste-admin-${data.usuarioId}`,
    });
  });
