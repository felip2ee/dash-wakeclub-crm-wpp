/**
 * Respostas rápidas: o texto pronto que a atendente insere digitando `/atalho`
 * no campo de envio. Leitura para qualquer sessão (só ativas); cadastro e
 * remoção são do admin. Usa a role do motor, a única com escrita nesta tabela.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { RespostaRapida } from "@/features/respostas-rapidas/filtro";

import { exigirAdmin, exigirSessao } from "./auth";
import { getPoolMotor } from "./db";

type Linha = { id: string; atalho: string; texto: string; ativo: boolean };

const paraResposta = (l: Linha): RespostaRapida => ({
  id: l.id,
  atalho: l.atalho,
  texto: l.texto,
  ativo: l.ativo,
});

// Espelha as constraints de wakeclub.respostas_rapidas.
const salvarSchema = z.object({
  id: z.string().uuid().optional(),
  atalho: z
    .string()
    .regex(/^[a-z0-9-]{2,30}$/, "Atalho: 2 a 30 letras minúsculas, números ou hífen."),
  texto: z.string().min(1, "Texto obrigatório.").max(2000, "Texto: no máximo 2000 caracteres."),
  ativo: z.boolean(),
});

export const listarRespostasRapidas = createServerFn({ method: "GET" }).handler(
  async (): Promise<RespostaRapida[]> => {
    await exigirSessao();
    const { rows } = await getPoolMotor().query<Linha>(
      `select id, atalho, texto, ativo
         from wakeclub.respostas_rapidas
        where ativo
        order by atalho`,
    );
    return rows.map(paraResposta);
  },
);

/** Cadastro completo (inclui inativas) para a tela de admin. */
export const listarTodasRespostasRapidas = createServerFn({ method: "GET" }).handler(
  async (): Promise<RespostaRapida[]> => {
    await exigirAdmin();
    const { rows } = await getPoolMotor().query<Linha>(
      `select id, atalho, texto, ativo
         from wakeclub.respostas_rapidas
        order by atalho`,
    );
    return rows.map(paraResposta);
  },
);

export const salvarRespostaRapida = createServerFn({ method: "POST" })
  .validator(salvarSchema)
  .handler(async ({ data }): Promise<RespostaRapida> => {
    await exigirAdmin();
    const db = getPoolMotor();
    try {
      const { rows } = data.id
        ? await db.query<Linha>(
            `update wakeclub.respostas_rapidas
                set atalho = $2::text, texto = $3::text, ativo = $4::boolean
              where id = $1::uuid
          returning id, atalho, texto, ativo`,
            [data.id, data.atalho, data.texto, data.ativo],
          )
        : await db.query<Linha>(
            `insert into wakeclub.respostas_rapidas (atalho, texto, ativo)
             values ($1::text, $2::text, $3::boolean)
          returning id, atalho, texto, ativo`,
            [data.atalho, data.texto, data.ativo],
          );
      if (!rows[0]) throw new Error("Resposta rápida não encontrada.");
      return paraResposta(rows[0]);
    } catch (erro) {
      if ((erro as { code?: string }).code === "23505") {
        throw new Error(`Já existe uma resposta com o atalho /${data.atalho}.`);
      }
      throw erro;
    }
  });

export const removerRespostaRapida = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<{ removida: true }> => {
    await exigirAdmin();
    await getPoolMotor().query("delete from wakeclub.respostas_rapidas where id = $1::uuid", [
      data.id,
    ]);
    return { removida: true };
  });
