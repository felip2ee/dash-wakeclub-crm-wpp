import { describe, expect, test } from "bun:test";

import { aplicarRitmo, lerPainelIa, lerRitmoAdmin, registrarExecucao } from "./admin-ia";
import { getPoolMotor } from "./db";
import { bancoTesteAtivo, criarVendedor } from "./motor/banco-teste";

const db = () => getPoolMotor();

describe.skipIf(!bancoTesteAtivo)("admin de IA e ritmo no banco", () => {
  test("definir aquecido sem confirmar falha", async () => {
    const admin = await criarVendedor("Admin ritmo");
    await aplicarRitmo(db(), { modo: "conservador" }, admin);
    await expect(aplicarRitmo(db(), { modo: "aquecido" }, admin)).rejects.toThrow();
    await expect(
      aplicarRitmo(db(), { modo: "aquecido", confirmar: false }, admin),
    ).rejects.toThrow();
    expect((await lerRitmoAdmin(db())).modo).toBe("conservador");
  });

  test("definir aquecido grava evento rhythm_changed", async () => {
    const admin = await criarVendedor("Admin ritmo");
    await aplicarRitmo(db(), { modo: "aquecido", confirmar: true }, admin);

    const ritmo = await lerRitmoAdmin(db());
    expect(ritmo).toMatchObject({ modo: "aquecido", cotaDia: 60, intervaloSegundos: 45 });
    expect(ritmo.ligadoEm).not.toBeNull();
    expect(typeof ritmo.enviadosHoje).toBe("number");

    const { rows } = await db().query(
      `select decisao, estado_novo->>'modo' as modo
         from wakeclub.eventos_automacao
        where tipo_evento = 'rhythm_changed' and metadados->>'usuario_id' = $1::text`,
      [admin],
    );
    expect(rows).toEqual([{ decisao: "ritmo aquecido", modo: "aquecido" }]);
    await aplicarRitmo(db(), { modo: "conservador" }, admin);
  });

  test("registrarExecucao acumula no jsonb", async () => {
    const a = `t8a-${Date.now()}`;
    const b = `t8b-${Date.now()}`;
    await registrarExecucao(db(), a);
    await registrarExecucao(db(), b);

    const { ultimaExecucao } = await lerPainelIa(db());
    expect(Number.isNaN(Date.parse(ultimaExecucao[a]))).toBe(false);
    expect(Number.isNaN(Date.parse(ultimaExecucao[b]))).toBe(false);

    const antes = ultimaExecucao[a];
    await registrarExecucao(db(), a);
    const depois = (await lerPainelIa(db())).ultimaExecucao;
    expect(Date.parse(depois[a])).toBeGreaterThanOrEqual(Date.parse(antes));
    expect(depois[b]).toBe(ultimaExecucao[b]);
  });
});
