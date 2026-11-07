import { describe, expect, test } from "bun:test";

import { PRAZOS_PADRAO, prazosDe, schemaPrazos } from "./parado";

describe("prazos do sinal parado", () => {
  test("jsonb vazio devolve o padrão", () => {
    expect(prazosDe({})).toEqual(PRAZOS_PADRAO);
    expect(prazosDe(null)).toEqual(PRAZOS_PADRAO);
  });

  test("um campo presente muda só ele", () => {
    expect(prazosDe({ em_atendimento_h: 48 })).toEqual({ ...PRAZOS_PADRAO, emAtendimentoH: 48 });
  });

  test("campo inválido cai no padrão daquele campo", () => {
    expect(prazosDe({ cadastrado_h: 0, aluno_sem_horas_dias: "x", link_enviado_h: 30 })).toEqual({
      ...PRAZOS_PADRAO,
      linkEnviadoH: 30,
    });
  });

  test("schemaPrazos rejeita zero, não inteiro e fora do teto", () => {
    expect(schemaPrazos.safeParse(PRAZOS_PADRAO).success).toBe(true);
    expect(schemaPrazos.safeParse({ ...PRAZOS_PADRAO, emAtendimentoH: 0 }).success).toBe(false);
    expect(schemaPrazos.safeParse({ ...PRAZOS_PADRAO, linkEnviadoH: 1.5 }).success).toBe(false);
    expect(schemaPrazos.safeParse({ ...PRAZOS_PADRAO, cadastradoH: 721 }).success).toBe(false);
    expect(schemaPrazos.safeParse({ ...PRAZOS_PADRAO, alunoSemHorasDias: 91 }).success).toBe(false);
  });
});
