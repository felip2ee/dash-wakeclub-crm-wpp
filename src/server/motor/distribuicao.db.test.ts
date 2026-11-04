import { beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { comTransacao, getPoolMotor, getPoolRw } from "../db";
import { bancoTesteAtivo, criarVendedor, desativarTodos, telefoneUnico } from "./banco-teste";
import {
  atribuirSeSemDono,
  carregarVendedores,
  redistribuirSoltos,
  soltarDeInativos,
} from "./distribuicao";
import { registrarMensagem } from "./ingestao";

const db = () => getPoolMotor();

async function novoLead(texto = "oi"): Promise<string> {
  const r = await comTransacao((c) =>
    registrarMensagem(c, {
      tipo: "mensagem",
      telefone: telefoneUnico(),
      nome: "Lead",
      daEquipe: false,
      texto,
      tipoMidia: "texto",
      enviadaEm: new Date().toISOString(),
      evolutionMsgId: randomUUID(),
    }),
  );
  return r.leadId;
}

async function dono(leadId: string) {
  const { rows } = await db().query(
    "select atendente_id, atribuido_por from wakeclub.leads where id = $1::uuid",
    [leadId],
  );
  return rows[0] as { atendente_id: string | null; atribuido_por: string | null };
}

const atribuir = (leadId: string, texto = "") =>
  comTransacao((c) => atribuirSeSemDono(c, leadId, texto));

describe.skipIf(!bancoTesteAtivo)("distribuição no banco", () => {
  beforeEach(desativarTodos);

  test("atribui na entrada e registra evento", async () => {
    const ana = await criarVendedor("Ana");
    const leadId = await novoLead();
    expect(await atribuir(leadId)).toBe(ana);
    expect(await dono(leadId)).toEqual({ atendente_id: ana, atribuido_por: "rodizio" });
    const { rows } = await db().query(
      `select decisao, metadados ->> 'motivo' as motivo, estado_novo ->> 'atendente_id' as novo
         from wakeclub.eventos_automacao
        where lead_id = $1::uuid and tipo_evento = 'assignment_changed'`,
      [leadId],
    );
    expect(rows).toEqual([{ decisao: `sem dono -> ${ana}`, motivo: "rodizio", novo: ana }]);
  });

  test("lead com dono nao muda com mencao", async () => {
    const ana = await criarVendedor("Ana");
    const leadId = await novoLead();
    await atribuir(leadId);
    await criarVendedor("Bruna");
    expect(await atribuir(leadId, "quero falar com a bruna")).toBeNull();
    expect((await dono(leadId)).atendente_id).toBe(ana);
  });

  test("dono inativo conta como sem dono", async () => {
    const ana = await criarVendedor("Ana");
    const leadId = await novoLead();
    await atribuir(leadId);
    const bia = await criarVendedor("Bia");
    await getPoolRw().query("update wakeclub.usuarios set ativo = false where id = $1::uuid", [
      ana,
    ]);
    expect(await atribuir(leadId)).toBe(bia);
  });

  test("mencao nao conta no peso", async () => {
    const ana = await criarVendedor("Ana");
    await criarVendedor("Bia");
    const leadId = await novoLead();
    expect(await atribuir(leadId, "a ana me indicou")).toBe(ana);
    expect((await dono(leadId)).atribuido_por).toBe("mencao");
    const vendedores = await carregarVendedores(db());
    expect(vendedores.find((v) => v.id === ana)?.recebidos30d).toBe(0);
  });

  test("desativado solta e redistribui", async () => {
    const ana = await criarVendedor("Ana");
    const leadId = await novoLead();
    await atribuir(leadId);
    const bia = await criarVendedor("Bia");
    await getPoolRw().query("update wakeclub.usuarios set ativo = false where id = $1::uuid", [
      ana,
    ]);
    const soltos = await comTransacao((c) => soltarDeInativos(c));
    expect(soltos).toBeGreaterThanOrEqual(1);
    expect((await dono(leadId)).atendente_id).toBeNull();
    await comTransacao((c) => redistribuirSoltos(c));
    expect(await dono(leadId)).toEqual({ atendente_id: bia, atribuido_por: "desativacao" });
  });

  test("sem vendedor ativo o lead fica sem dono", async () => {
    const leadId = await novoLead();
    expect(await atribuir(leadId)).toBeNull();
    expect((await dono(leadId)).atendente_id).toBeNull();
  });
});
