import { describe, expect, test } from "bun:test";

import { getPoolMotor } from "../db";
import { bancoTesteAtivo } from "./banco-teste";
import { tentarRodar } from "./agenda";

describe.skipIf(!bancoTesteAtivo)("agenda com trava no banco", () => {
  test("outra replica com a trava impede a execucao", async () => {
    const outra = await getPoolMotor().connect();
    let rodou = false;
    try {
      await outra.query("select pg_advisory_lock(hashtext('wakecrm:teste-trava'))");
      expect(await tentarRodar("teste-trava", async () => void (rodou = true))).toBe(false);
      expect(rodou).toBe(false);
      await outra.query("select pg_advisory_unlock(hashtext('wakecrm:teste-trava'))");
      expect(await tentarRodar("teste-trava", async () => void (rodou = true))).toBe(true);
      expect(rodou).toBe(true);
    } finally {
      outra.release();
    }
  });
});
