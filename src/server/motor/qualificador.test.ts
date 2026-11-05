import { describe, expect, test } from "bun:test";

import { type LinhaLead, montarPromptLead, validarQualificacao } from "./qualificador";

const ctx = {
  etiquetaAtual: "Novo lead",
  minimoLocal: "2026-11-04 10:30",
  limiteLocal: "2026-12-04 10:00",
};

const base = {
  etiqueta: "Agendado",
  temperatura: "quente",
  resumo: "Quer aula de 4h no sábado.",
  followup: null,
  horas_estimadas: 4,
};

function ok(cru: unknown) {
  const r = validarQualificacao(cru, ctx);
  if ("erro" in r) throw new Error(r.erro);
  return r;
}

describe("validação tolerante", () => {
  test("etiqueta inválida vira a atual", () => {
    expect(ok({ ...base, etiqueta: "Inventada" }).etiqueta).toBe("Novo lead");
  });

  test("etiqueta legada vira a etapa nova", () => {
    expect(ok({ ...base, etiqueta: "Atendimento" }).etiqueta).toBe("Em atendimento");
    expect(ok({ ...base, etiqueta: "Negociacao encerrada" }).etiqueta).toBe("Encerrado");
  });

  test("etapa do app não é movida pela IA", () => {
    const r = validarQualificacao(
      { ...base, etiqueta: "Novo lead" },
      { ...ctx, etiquetaAtual: "Cadastrado" },
    );
    expect(r).toMatchObject({ etiqueta: "Cadastrado" });
  });

  test("followup devolvido pela IA é descartado", () => {
    const f = { quando: "2026-11-10 09:00", tipo: "reengajar", motivo: "x" };
    expect(ok({ ...base, followup: f }).followup).toBeNull();
  });

  test("temperatura inválida vira vazio", () => {
    expect(ok({ ...base, temperatura: "fervendo" }).temperatura).toBe("");
    expect(ok({ ...base, temperatura: "QUENTE" }).temperatura).toBe("quente");
  });

  test("sem resumo é erro", () => {
    expect(validarQualificacao({ ...base, resumo: "  " }, ctx)).toEqual({
      erro: "a IA nao devolveu resumo",
    });
    expect(validarQualificacao("texto", ctx)).toEqual({ erro: "a IA nao devolveu objeto" });
  });

  test("data impossível no CARIMBO é descartada", () => {
    for (const quando of ["2026-02-30 10:00", "2026-11-10 25:61"]) {
      expect(ok({ ...base, data_agendada: quando }).dataAgendada).toBe("");
    }
    expect(ok({ ...base, data_agendada: "2026-11-10 09:00" }).dataAgendada).toBe(
      "2026-11-10 09:00",
    );
  });

  test("horas_estimadas: inteiro com clamp 1..8, default 1", () => {
    expect(ok({ ...base, horas_estimadas: "quatro" }).horasEstimadas).toBe(1);
    expect(ok({ ...base, horas_estimadas: 0 }).horasEstimadas).toBe(1);
    expect(ok({ ...base, horas_estimadas: 9 }).horasEstimadas).toBe(8);
    expect(ok({ ...base, horas_estimadas: undefined }).horasEstimadas).toBe(1);
    expect(ok({ ...base, horas_estimadas: 4 }).horasEstimadas).toBe(4);
  });

  test("data agendada fora do CARIMBO vira vazio", () => {
    expect(ok({ ...base, data_agendada: "sábado" }).dataAgendada).toBe("");
    expect(ok({ ...base, data_agendada: "2026-11-07 09:00" }).dataAgendada).toBe(
      "2026-11-07 09:00",
    );
  });
});

describe("prompt do lead", () => {
  const linha: LinhaLead = {
    lead_id: "l1",
    telefone: "+5563900000000",
    nome: null,
    etiqueta: null,
    origem: null,
    interesse: null,
    objecao: null,
    temperatura: null,
    resumo: null,
    n_toques: 0,
    data_agendada_local: null,
    agora_local: "2026-11-04 10:00",
    minimo_local: "2026-11-04 10:30",
    limite_local: "2026-12-04 10:00",
    min_desde_lead: null,
    min_desde_equipe: null,
    historico: [],
  };

  test("histórico vazio diz que não há mensagem", () => {
    const p = montarPromptLead(linha);
    expect(p).toStartWith("AGORA: 2026-11-04 10:00 (America/Sao_Paulo)\n");
    expect(p).toContain("etiqueta: Novo lead\n");
    expect(p).toContain("followups enviados sem resposta: 0\n");
    expect(p).toContain("minutos desde a ultima mensagem do lead: (nunca falou)\n");
    expect(p).toEndWith("CONVERSA (mais antiga primeiro)\n(nenhuma mensagem registrada)\n");
  });

  test("histórico vira linhas com quem falou", () => {
    const p = montarPromptLead({
      ...linha,
      historico: [
        { quem: "lead", em: "2026-11-04 09:00", texto: "oi" },
        { quem: "equipe", em: "2026-11-04 09:01", texto: null },
        { quem: "ia", em: null, texto: "olá" },
      ],
    });
    expect(p).toEndWith(
      "[2026-11-04 09:00] LEAD: oi\n[2026-11-04 09:01] EQUIPE: (sem texto)\n[?] IA: olá\n",
    );
  });
});
