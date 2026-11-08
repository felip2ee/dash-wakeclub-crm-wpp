import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { comTransacao, getPoolMotor } from "../db";
import type { AdaptadorEvolution } from "../evolution/tipos";
import { clienteIaFalso } from "../ia/falso";
import { bancoTesteAtivo, criarVendedor, telefoneUnico } from "./banco-teste";
import { tarefaComprovantes } from "./comprovantes";
import { registrarMensagem } from "./ingestao";

const db = () => getPoolMotor();
const MIN = 60_000;
const CHAVE = "pix@wake.test";
const CONFIG_OK = { chave: CHAVE, cnpj: null, precos: { "1": 400, "2": 720, "4": 1300 } };
const CONFIG_VAZIA = { chave: null, cnpj: null, precos: { "1": null, "2": null, "4": null } };

const configurar = (v: unknown) =>
  db().query("update wakeclub.configuracoes set valor = $1::jsonb where chave = 'venda_pix'", [
    JSON.stringify(v),
  ]);

/** "YYYY-MM-DD HH:MM" em Brasília, `min` minutos a partir de agora. */
const brasilia = (min: number) =>
  new Date(Date.now() - 3 * 60 * MIN + min * MIN).toISOString().slice(0, 16).replace("T", " ");

/** O papel só muda pelo dono do banco (nenhuma role da aplicação tem UPDATE nele). */
function tornarAdmin(id: string) {
  const r = spawnSync(
    "node",
    [
      "--input-type=module",
      "-e",
      `import pg from "pg";
       const c = new pg.Client(process.env.ADMIN_DATABASE_URL);
       await c.connect();
       await c.query("update wakeclub.usuarios set papel = 'admin' where id = $1::uuid", [process.argv[1]]);
       await c.end();`,
      id,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stderr);
}

const e2eNovo = () => `E${randomUUID().replace(/-/g, "")}`;

const leitura = (extra: Record<string, unknown> = {}) => ({
  eh_comprovante: true,
  legivel: true,
  valor: 720,
  pago_em: brasilia(-30),
  pagador: "Fulano",
  recebedor: "Wake Club",
  chave_recebedor: CHAVE,
  cnpj_recebedor: null,
  e2e: e2eNovo(),
  ...extra,
});

/** Lead com dono (10%), saldo 1, pedido de 2 h e resposta da equipe há 50 min. */
async function criarLead() {
  const tel = telefoneUnico();
  const msg = (daEquipe: boolean, texto: string, min: number) =>
    comTransacao((c) =>
      registrarMensagem(c, {
        tipo: "mensagem",
        telefone: tel,
        nome: "Lead Pix",
        daEquipe,
        texto,
        tipoMidia: "texto",
        enviadaEm: new Date(Date.now() - min * MIN).toISOString(),
        evolutionMsgId: randomUUID(),
      }),
    );
  const r = await msg(false, "quero o pacote de 2 horas", 60);
  await msg(true, "fechado, 2 h ficam R$ 720", 50);
  const vendedorId = await criarVendedor("Vendedor Pix");
  await db().query("update wakeclub.usuarios set comissao_pct = 10 where id = $1::uuid", [
    vendedorId,
  ]);
  await db().query(
    "update wakeclub.leads set atendente_id = $2::uuid, saldo_horas = 1 where id = $1::uuid",
    [r.leadId, vendedorId],
  );
  return { leadId: r.leadId, tel, vendedorId };
}

/** Mensagem de mídia do lead; devolve o id da mensagem e o da Evolution. */
async function midia(tel: string, tipoMidia: "imagem" | "documento" = "imagem", min = 5) {
  const evolutionMsgId = randomUUID();
  const r = await comTransacao((c) =>
    registrarMensagem(c, {
      tipo: "mensagem",
      telefone: tel,
      nome: "Lead Pix",
      daEquipe: false,
      texto: tipoMidia === "imagem" ? "[imagem]" : "[documento]",
      tipoMidia,
      enviadaEm: new Date(Date.now() - min * MIN).toISOString(),
      evolutionMsgId,
    }),
  );
  return { mensagemId: r.mensagemId as string, evolutionMsgId };
}

const bytes = () => new TextEncoder().encode(randomUUID());

/** Adaptador falso: só devolve mídia para os ids do mapa. */
function adaptador(mapa: Record<string, { mime: string; dados: Uint8Array }>) {
  return {
    baixarMidia: async (id: string) => mapa[id] ?? null,
  } as unknown as AdaptadorEvolution;
}

async function comprovante(mensagemId: string) {
  const { rows } = await db().query(
    "select * from wakeclub.comprovantes where mensagem_id = $1::uuid",
    [mensagemId],
  );
  return rows[0] as Record<string, unknown> | undefined;
}

/**
 * Roda a tarefa até o comprovante desta mensagem mudar (outros testes podem deixar mídia
 * pendente no banco, que ocupa a rodada).
 */
async function rodar(
  mensagemId: string,
  deps: { ia: ReturnType<typeof clienteIaFalso>; adaptador: AdaptadorEvolution },
) {
  const antes = await comprovante(mensagemId);
  const marca = (c?: Record<string, unknown>) => `${c?.status}:${c?.tentativas}`;
  for (let i = 0; i < 12; i++) {
    await tarefaComprovantes(deps);
    const agora = await comprovante(mensagemId);
    if (agora && marca(agora) !== marca(antes)) return agora;
  }
  throw new Error("comprovante não mudou");
}

async function vendasDoLead(leadId: string) {
  const { rows } = await db().query("select * from wakeclub.vendas where lead_id = $1::uuid", [
    leadId,
  ]);
  return rows;
}

describe.skipIf(!bancoTesteAtivo)("tarefaComprovantes", () => {
  afterAll(async () => {
    await configurar(CONFIG_VAZIA);
  });

  test("registra sozinho quando tudo confere", async () => {
    await configurar(CONFIG_OK);
    const l = await criarLead();
    const m = await midia(l.tel);
    const ia = clienteIaFalso({ chat: [leitura(), { horas: 2, trecho: "pacote de 2 horas" }] });
    const c = await rodar(m.mensagemId, {
      ia,
      adaptador: adaptador({ [m.evolutionMsgId]: { mime: "image/jpeg", dados: bytes() } }),
    });
    expect(c.status).toBe("registrado");
    expect(ia.chamadas.chat[0].anexos?.[0].mime).toBe("image/jpeg");

    const [v] = await vendasDoLead(l.leadId);
    expect(v.id).toBe(c.venda_id);
    expect([v.origem_externa, v.status, Number(v.valor), v.horas]).toEqual(["pix", "paga", 720, 2]);
    expect([v.vinculada_por, v.vendedor_id, v.categoria]).toEqual([
      "comprovante",
      l.vendedorId,
      "atendimento",
    ]);
    expect(Number(v.comissao_valor)).toBe(72);

    const { rows: lead } = await db().query(
      "select etiqueta, saldo_horas from wakeclub.leads where id = $1::uuid",
      [l.leadId],
    );
    expect(lead[0]).toEqual({ etiqueta: "Aluno com horas", saldo_horas: 3 });

    const { rows: ev } = await db().query(
      `select tipo_evento, gatilho from wakeclub.eventos_automacao
        where entidade_tipo = 'comprovante' and entidade_id = $1::uuid`,
      [c.id],
    );
    expect(ev).toEqual([{ tipo_evento: "sale_registered", gatilho: "motor" }]);
    // Etapa e saldo movidos pelo registro automático também saem como motor, não admin.
    const { rows: etapa } = await db().query(
      `select distinct gatilho from wakeclub.eventos_automacao
        where lead_id = $1::uuid and correlacao_id like 'motor:venda-vinculada:%'`,
      [l.leadId],
    );
    expect(etapa).toEqual([{ gatilho: "motor" }]);
  });

  test("recebedor de outra conta vira pergunta e avisa os admins", async () => {
    await configurar(CONFIG_OK);
    const adminId = await criarVendedor("Admin Pix");
    tornarAdmin(adminId);
    const l = await criarLead();
    const m = await midia(l.tel);
    const ia = clienteIaFalso({
      chat: [leitura({ chave_recebedor: "golpe@outra.conta" }), { horas: 2, trecho: "2 horas" }],
    });
    const c = await rodar(m.mensagemId, {
      ia,
      adaptador: adaptador({ [m.evolutionMsgId]: { mime: "image/png", dados: bytes() } }),
    });
    expect([c.status, c.motivo, c.horas_sugeridas, c.venda_id]).toEqual([
      "confirmar",
      "recebedor não confere com a chave/CNPJ da Wake",
      2,
      null,
    ]);
    expect(await vendasDoLead(l.leadId)).toHaveLength(0);
    const { rows: n } = await db().query(
      `select titulo, corpo, url from wakeclub.notificacoes
        where usuario_id = $1::uuid and tipo = 'comprovante'`,
      [adminId],
    );
    expect(n).toHaveLength(1);
    expect(n[0].titulo).toBe("Comprovante para confirmar");
    expect(n[0].corpo).toMatch(/^Lead Pix · R\$\s720,00$/);
    expect(n[0].url).toBe("/vendas");
  });

  test("mesmo arquivo reenviado vira repetido sem chamar a IA", async () => {
    await configurar(CONFIG_OK);
    const l = await criarLead();
    const a = await midia(l.tel);
    const dados = bytes();
    const mapa: Record<string, { mime: string; dados: Uint8Array }> = {
      [a.evolutionMsgId]: { mime: "image/jpeg", dados },
    };
    const ad = adaptador(mapa);
    const ia = clienteIaFalso({ chat: [leitura({ valor: 700 }), { horas: 2, trecho: "" }] });
    const ca = await rodar(a.mensagemId, { ia, adaptador: ad });
    expect(ca.status).toBe("confirmar");
    // O segundo chega depois que o primeiro já foi lido.
    const b = await midia(l.tel, "imagem", 1);
    mapa[b.evolutionMsgId] = { mime: "image/jpeg", dados };
    const cb = await rodar(b.mensagemId, { ia, adaptador: ad });
    expect([cb.status, cb.repetido_de]).toEqual(["repetido", ca.id]);
    expect(ia.chamadas.chat).toHaveLength(2);
  });

  test("mesmo E2E de outro comprovante vira repetido", async () => {
    await configurar(CONFIG_OK);
    const l = await criarLead();
    const a = await midia(l.tel);
    const e2e = e2eNovo();
    const mapa: Record<string, { mime: string; dados: Uint8Array }> = {
      [a.evolutionMsgId]: { mime: "image/jpeg", dados: bytes() },
    };
    const ad = adaptador(mapa);
    const ia = clienteIaFalso({
      chat: [leitura({ e2e }), { horas: 2, trecho: "" }, leitura({ e2e, pago_em: brasilia(-15) })],
    });
    expect((await rodar(a.mensagemId, { ia, adaptador: ad })).status).toBe("registrado");
    const b = await midia(l.tel, "documento", 1);
    mapa[b.evolutionMsgId] = { mime: "application/pdf", dados: bytes() };
    const cb = await rodar(b.mensagemId, { ia, adaptador: ad });
    expect(cb.status).toBe("repetido");
    expect(await vendasDoLead(l.leadId)).toHaveLength(1);
  });

  test("E2E de venda já existente (estornada) vira repetido", async () => {
    await configurar(CONFIG_OK);
    const l = await criarLead();
    const e2e = e2eNovo().toUpperCase();
    await db().query(
      `insert into wakeclub.vendas (origem_externa, id_externo, comprada_em, valor, status)
       values ('pix', $1::text, now(), 720, 'estornada')`,
      [e2e],
    );
    const m = await midia(l.tel);
    const ia = clienteIaFalso({ chat: [leitura({ e2e })] });
    const c = await rodar(m.mensagemId, {
      ia,
      adaptador: adaptador({ [m.evolutionMsgId]: { mime: "image/jpeg", dados: bytes() } }),
    });
    expect([c.status, c.repetido_de]).toEqual(["repetido", null]);
    expect(await vendasDoLead(l.leadId)).toHaveLength(0);
  });

  test("print e PDF sem E2E, mesmo valor e hora: uma venda só", async () => {
    await configurar(CONFIG_OK);
    const l = await criarLead();
    const print = await midia(l.tel);
    const mapa: Record<string, { mime: string; dados: Uint8Array }> = {
      [print.evolutionMsgId]: { mime: "image/jpeg", dados: bytes() },
    };
    const ad = adaptador(mapa);
    const ia = clienteIaFalso({
      chat: [
        leitura({ e2e: null, pago_em: brasilia(-30) }),
        { horas: 2, trecho: "" },
        leitura({ e2e: null, pago_em: brasilia(-27) }),
      ],
    });
    const cp = await rodar(print.mensagemId, { ia, adaptador: ad });
    expect(cp.status).toBe("registrado");
    const pdf = await midia(l.tel, "documento", 2);
    mapa[pdf.evolutionMsgId] = { mime: "application/pdf", dados: bytes() };
    const cd = await rodar(pdf.mensagemId, { ia, adaptador: ad });
    expect([cd.status, cd.repetido_de]).toEqual(["repetido", cp.id]);
    const vendas = await vendasDoLead(l.leadId);
    expect(vendas).toHaveLength(1);
    expect(vendas[0].id_externo).toBe(`msg:${print.evolutionMsgId}`);
    expect(ia.chamadas.chat[2].anexos?.[0].nomeArquivo).toBe("comprovante.pdf");
  });

  test("imagem que não é comprovante vira nao_e", async () => {
    const l = await criarLead();
    const m = await midia(l.tel);
    const ia = clienteIaFalso({ chat: [{ eh_comprovante: false, legivel: true }] });
    const c = await rodar(m.mensagemId, {
      ia,
      adaptador: adaptador({ [m.evolutionMsgId]: { mime: "image/webp", dados: bytes() } }),
    });
    expect(c.status).toBe("nao_e");
    expect(ia.chamadas.chat).toHaveLength(1);
  });

  test("formato que a IA não lê vira nao_e sem chamar a IA", async () => {
    const l = await criarLead();
    const m = await midia(l.tel);
    const ia = clienteIaFalso({});
    const c = await rodar(m.mensagemId, {
      ia,
      adaptador: adaptador({ [m.evolutionMsgId]: { mime: "image/heic", dados: bytes() } }),
    });
    expect([c.status, c.motivo]).toEqual(["nao_e", "formato image/heic"]);
    expect(ia.chamadas.chat).toHaveLength(0);
  });

  test("mensagem de mais de 7 dias é ignorada", async () => {
    const l = await criarLead();
    const m = await midia(l.tel, "imagem", 8 * 24 * 60);
    const ia = clienteIaFalso({});
    const ad = adaptador({ [m.evolutionMsgId]: { mime: "image/jpeg", dados: bytes() } });
    for (let i = 0; i < 3; i++) await tarefaComprovantes({ ia, adaptador: ad });
    expect(await comprovante(m.mensagemId)).toBeUndefined();
  });

  test("IA que falha volta para nova tentativa e desiste na 3ª, sem venda", async () => {
    await configurar(CONFIG_OK);
    const l = await criarLead();
    const m = await midia(l.tel);
    const ia = clienteIaFalso({ chat: [new Error("boom"), new Error("boom"), new Error("boom")] });
    const ad = adaptador({ [m.evolutionMsgId]: { mime: "image/jpeg", dados: bytes() } });
    let c = await rodar(m.mensagemId, { ia, adaptador: ad });
    expect([c.status, c.tentativas, c.motivo]).toEqual(["lendo", 1, "boom"]);
    c = await rodar(m.mensagemId, { ia, adaptador: ad });
    expect([c.status, c.tentativas]).toEqual(["lendo", 2]);
    c = await rodar(m.mensagemId, { ia, adaptador: ad });
    expect([c.status, c.tentativas, c.venda_id]).toEqual(["falhou", 3, null]);
    expect(await vendasDoLead(l.leadId)).toHaveLength(0);
    const { rows: ev } = await db().query(
      `select tipo_evento from wakeclub.eventos_automacao
        where entidade_tipo = 'comprovante' and entidade_id = $1::uuid`,
      [c.id],
    );
    expect(ev).toEqual([{ tipo_evento: "receipt_failed" }]);
  });

  test("sem configuração vira pergunta com o motivo de configurar", async () => {
    await configurar(CONFIG_VAZIA);
    const l = await criarLead();
    const m = await midia(l.tel);
    const ia = clienteIaFalso({ chat: [leitura(), { horas: 2, trecho: "" }] });
    const c = await rodar(m.mensagemId, {
      ia,
      adaptador: adaptador({ [m.evolutionMsgId]: { mime: "image/jpeg", dados: bytes() } }),
    });
    expect([c.status, c.motivo]).toEqual([
      "confirmar",
      "configure a chave Pix e os preços dos pacotes",
    ]);
    expect(await vendasDoLead(l.leadId)).toHaveLength(0);
  });
});
