import { describe, expect, test } from "bun:test";

import { comTransacao, getPoolMotor } from "../db";
import { bancoTesteAtivo } from "./banco-teste";
import { tentarRodar } from "./agenda";

describe.skipIf(!bancoTesteAtivo)("agenda com trava no banco", () => {
  test("outra replica com a trava impede a execucao", async () => {
    const outra = await getPoolMotor().connect();
    let rodou = false;
    try {
      await outra.query("select pg_advisory_lock(hashtext('wakecrm:tarefa:teste-trava'))");
      expect(await tentarRodar("teste-trava", async () => void (rodou = true))).toBe(false);
      expect(rodou).toBe(false);
      await outra.query("select pg_advisory_unlock(hashtext('wakecrm:tarefa:teste-trava'))");
      expect(await tentarRodar("teste-trava", async () => void (rodou = true))).toBe(true);
      expect(rodou).toBe(true);
    } finally {
      outra.release();
    }
  });

  test("a trava da tarefa não colide com a trava de domínio de mesmo nome", async () => {
    // A tarefa "distribuicao" chama atribuirSeSemDono, que pega a xact lock
    // 'wakecrm:distribuicao' noutra conexão: com a mesma chave, esperaria por si mesma.
    const rodou = tentarRodar("distribuicao", () =>
      comTransacao(async (c) => {
        await c.query("set local lock_timeout = '2s'");
        await c.query("select pg_advisory_xact_lock(hashtext('wakecrm:distribuicao'))");
      }),
    );
    expect(await rodou).toBe(true);
  });
});
