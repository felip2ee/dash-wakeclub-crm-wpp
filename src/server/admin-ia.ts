/**
 * Administração da IA e do ritmo (spec fases 2-3 §7 e §10): painel com o estado das
 * tarefas de IA e do follow-up, leitura e troca do modo de ritmo. Também o registro da
 * última execução de cada tarefa agendada, que `iniciar.ts` chama e o painel lê. Cada
 * server fn exige admin; o SQL fica em helpers que recebem o cliente, para testar sem
 * cookie.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { exigirAdmin } from "./auth";
import { type ClienteDb, getPoolMotor } from "./db";
import { obterAdaptador } from "./evolution";
import { definirRitmo, lerRitmo, MODOS, type Modo, preparadosHoje } from "./motor/ritmo";

/** Grava agora como última execução de `nome` em `configuracoes.tarefas_execucao`. */
export async function registrarExecucao(db: ClienteDb, nome: string): Promise<void> {
  await db.query(
    `insert into wakeclub.configuracoes (chave, valor)
     values ('tarefas_execucao', jsonb_build_object($1::text, now()))
     on conflict (chave) do update
       set valor = wakeclub.configuracoes.valor || jsonb_build_object($1::text, now())`,
    [nome],
  );
}

export type PainelIa = {
  chaveConfigurada: boolean;
  adaptadorPresente: boolean;
  transcricoesPendentes: number;
  leadsAQualificar: number;
  aguardandoAprovacaoPorVendedor: { vendedorId: string; nome: string; quantidade: number }[];
  aprovadosAEnviar: number;
  ultimaExecucao: Record<string, string>;
};

export async function lerPainelIa(
  db: ClienteDb,
): Promise<Omit<PainelIa, "chaveConfigurada" | "adaptadorPresente">> {
  const [contagem, porVendedor, execucao] = await Promise.all([
    db.query(
      `select
         (select count(*) from wakeclub.mensagens
           where transcricao_status in ('pendente', 'transcrevendo'))::int as transcricoes,
         (select count(*) from wakeclub.leads
           where qualificar_apos <= now() and opt_out = false
             and sem_atendimento = false)::int as a_qualificar,
         (select count(*) from wakeclub.followups where status = 'aprovado')::int as aprovados`,
    ),
    db.query(
      `select u.id, u.nome, count(*)::int as quantidade
         from wakeclub.followups f
         join wakeclub.leads l on l.id = f.lead_id
         join wakeclub.usuarios u on u.id = l.atendente_id
        where f.status = 'aguardando_aprovacao'
        group by u.id, u.nome
        order by u.nome`,
    ),
    db.query(`select valor from wakeclub.configuracoes where chave = 'tarefas_execucao'`),
  ]);
  return {
    transcricoesPendentes: Number(contagem.rows[0].transcricoes),
    leadsAQualificar: Number(contagem.rows[0].a_qualificar),
    aguardandoAprovacaoPorVendedor: porVendedor.rows.map((r) => ({
      vendedorId: r.id,
      nome: r.nome,
      quantidade: Number(r.quantidade),
    })),
    aprovadosAEnviar: Number(contagem.rows[0].aprovados),
    ultimaExecucao: (execucao.rows[0]?.valor ?? {}) as Record<string, string>,
  };
}

export type RitmoAdmin = {
  modo: Modo;
  ligadoEm: string | null;
  cotaDia: number;
  preparadosHoje: number;
  intervaloSegundos: number;
};

export async function lerRitmoAdmin(db: ClienteDb): Promise<RitmoAdmin> {
  const [ritmo, preparados] = await Promise.all([lerRitmo(db), preparadosHoje(db)]);
  return { ...ritmo, ...MODOS[ritmo.modo], preparadosHoje: preparados };
}

const entradaRitmo = z.object({
  modo: z.enum(["conservador", "aquecido"]),
  confirmar: z.boolean().optional(),
});

/** O aquecido é o modo perigoso: só liga com confirmação explícita. */
export async function aplicarRitmo(
  db: ClienteDb,
  entrada: z.infer<typeof entradaRitmo>,
  usuarioId: string,
): Promise<void> {
  if (entrada.modo === "aquecido" && entrada.confirmar !== true) {
    throw new Error("Confirme para ligar o modo aquecido.");
  }
  await definirRitmo(db, entrada.modo, usuarioId);
}

export const getPainelIa = createServerFn({ method: "GET" }).handler(
  async (): Promise<PainelIa> => {
    await exigirAdmin();
    return {
      chaveConfigurada: Boolean(process.env.OPENAI_API_KEY),
      adaptadorPresente: obterAdaptador() !== null,
      ...(await lerPainelIa(getPoolMotor())),
    };
  },
);

export const getRitmo = createServerFn({ method: "GET" }).handler(async (): Promise<RitmoAdmin> => {
  await exigirAdmin();
  return lerRitmoAdmin(getPoolMotor());
});

export const definirRitmoAdmin = createServerFn({ method: "POST" })
  .validator(entradaRitmo)
  .handler(async ({ data }): Promise<{ modo: Modo }> => {
    const admin = await exigirAdmin();
    await aplicarRitmo(getPoolMotor(), data, admin.usuarioId);
    return { modo: data.modo };
  });
