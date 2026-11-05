import { describe, expect, test } from "bun:test";

import {
  dataDoChip,
  legendaDaMidia,
  montarLinhaDoTempo,
  nomeDoDocumento,
  rotuloAudio,
  rotuloDia,
} from "./linha-do-tempo";

// 12/01/2026 10:24 em São Paulo (UTC-3).
const CADASTRO = "2026-01-12T13:24:00.000Z";

describe("montarLinhaDoTempo", () => {
  test("lead sem eventos tem só o cadastro", () => {
    expect(montarLinhaDoTempo(CADASTRO, [])).toEqual([
      { chave: "cadastro", tipo: "cadastro", rotulo: "Cadastro realizado", quando: CADASTRO },
    ]);
  });

  test("etapa e follow-up enviado em ordem cronológica, depois do cadastro", () => {
    const chips = montarLinhaDoTempo(CADASTRO, [
      { tipo: "followup_sent", ocorridoEm: "2026-01-20T12:00:00.000Z", de: null, para: null },
      {
        tipo: "stage_changed",
        ocorridoEm: "2026-01-14T19:07:00.000Z",
        de: "Novo Lead",
        para: "Atendimento",
      },
    ]);
    expect(chips.map((c) => c.rotulo)).toEqual([
      "Cadastro realizado",
      "Etapa: Novo Lead → Atendimento",
      "Follow-up enviado",
    ]);
    expect(chips.map((c) => c.tipo)).toEqual(["cadastro", "etapa", "followup"]);
    expect(new Set(chips.map((c) => c.chave)).size).toBe(3);
  });

  test("etapa sem anterior mostra só a nova; sem nova é descartada", () => {
    const chips = montarLinhaDoTempo(CADASTRO, [
      { tipo: "stage_changed", ocorridoEm: "2026-01-13T10:00:00.000Z", de: null, para: "Agendado" },
      { tipo: "stage_changed", ocorridoEm: "2026-01-13T11:00:00.000Z", de: "Agendado", para: null },
    ]);
    expect(chips.map((c) => c.rotulo)).toEqual(["Cadastro realizado", "Etapa: Agendado"]);
  });

  test("compra paga entra na ordem cronológica com produto ou horas", () => {
    const chips = montarLinhaDoTempo(
      CADASTRO,
      [{ tipo: "followup_sent", ocorridoEm: "2026-01-20T12:00:00.000Z", de: null, para: null }],
      [
        { compradaEm: "2026-01-25T12:00:00.000Z", produto: null, horas: 2 },
        { compradaEm: "2026-01-15T12:00:00.000Z", produto: "Wakeboard 1h", horas: 1 },
        { compradaEm: "2026-01-26T12:00:00.000Z", produto: null, horas: null },
      ],
    );
    expect(chips.map((c) => c.rotulo)).toEqual([
      "Cadastro realizado",
      "Compra · Wakeboard 1h",
      "Follow-up enviado",
      "Compra · 2 h",
      "Compra",
    ]);
    expect(chips[1]).toMatchObject({ tipo: "compra", quando: "2026-01-15T12:00:00.000Z" });
    expect(new Set(chips.map((c) => c.chave)).size).toBe(5);
  });

  test("ignora tipos que não são fatos da linha do tempo", () => {
    const chips = montarLinhaDoTempo(CADASTRO, [
      { tipo: "lead_qualified", ocorridoEm: "2026-01-13T10:00:00.000Z", de: null, para: null },
    ]);
    expect(chips).toHaveLength(1);
  });
});

describe("datas da conversa (fuso de São Paulo)", () => {
  test("separador de dia no formato da referência", () => {
    expect(rotuloDia("2026-01-20T15:00:00.000Z")).toBe("Ter, 20 de jan");
    // 01:30 UTC de 19/01 ainda é domingo 18/01 em São Paulo.
    expect(rotuloDia("2026-01-19T01:30:00.000Z")).toBe("Dom, 18 de jan");
  });

  test("data do chip com dia, mês e hora", () => {
    expect(dataDoChip(CADASTRO)).toBe("12 jan, 10:24");
  });
});

describe("rotuloAudio", () => {
  test("ok usa a transcrição (sem rótulo)", () => {
    expect(rotuloAudio("ok")).toBeNull();
  });

  test("cada status sem transcrição tem o seu rótulo", () => {
    expect(rotuloAudio("pendente")).toBe("Transcrevendo…");
    expect(rotuloAudio("transcrevendo")).toBe("Transcrevendo…");
    expect(rotuloAudio("falhou")).toBe("Não foi possível transcrever");
    expect(rotuloAudio("sem_midia")).toBe("Áudio indisponível");
  });

  test("status desconhecido ou legado vira só 'Áudio', nunca o placeholder", () => {
    expect(rotuloAudio(null)).toBe("Áudio");
    expect(rotuloAudio("outro")).toBe("Áudio");
  });
});

describe("legenda da mídia", () => {
  test("marcadores do WhatsApp não viram legenda", () => {
    expect(legendaDaMidia("[imagem]")).toBeNull();
    expect(legendaDaMidia("[video]")).toBeNull();
    expect(legendaDaMidia("[documento proposta.pdf]")).toBeNull();
    expect(legendaDaMidia(null)).toBeNull();
  });

  test("legenda de verdade aparece", () => {
    expect(legendaDaMidia("olha a foto [imagem]")).toBe("olha a foto [imagem]");
  });

  test("nome do documento sai do marcador", () => {
    expect(nomeDoDocumento("[documento proposta.pdf]")).toBe("proposta.pdf");
    expect(nomeDoDocumento("[documento]")).toBeNull();
    expect(nomeDoDocumento("segue")).toBeNull();
  });
});
