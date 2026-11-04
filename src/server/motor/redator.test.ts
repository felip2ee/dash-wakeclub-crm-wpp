import { describe, expect, test } from "bun:test";

import {
  formatarAvaliacoes,
  type LinhaFollowup,
  modoDoFollowup,
  montarPromptPorteiro,
  montarPromptRedator,
  validarPorteiro,
  validarTexto,
} from "./redator";

const linha = (extra: Partial<LinhaFollowup> = {}): LinhaFollowup => ({
  followup_id: "f1",
  lead_id: "l1",
  tipo: "reengajar",
  motivo: "sumiu depois do valor",
  nome: "Felipe",
  etiqueta: "Atendimento",
  interesse: null,
  objecao: null,
  temperatura: "morno",
  resumo: null,
  n_toques: 1,
  atendente_id: "u1",
  atendente_nome: "Isadora Souza",
  data_agendada_local: null,
  agora_local: "2026-11-04 10:00",
  minimo_local: "2026-11-04 10:30",
  limite_local: "2026-12-04 10:00",
  min_desde_lead: 60,
  min_desde_equipe: null,
  historico: [{ quem: "lead", em: "2026-11-03 09:00", texto: "quanto custa?" }],
  textos_anteriores: [],
  ...extra,
});

describe("modoDoFollowup", () => {
  test("REABRIR por padrão; Link enviado fica REABRIR", () => {
    expect(modoDoFollowup(linha()).modo).toBe("REABRIR");
    const link = modoDoFollowup(linha({ etiqueta: "Link enviado" }));
    expect(link.modo).toBe("REABRIR");
    expect(link.porque).toBe("Link enviado registra o que a EQUIPE fez, nao pedido do lead");
  });

  test("RETOMAR por etiqueta concreta, tipo concreto ou aula marcada", () => {
    expect(modoDoFollowup(linha({ etiqueta: "Aguardando pagamento" }))).toEqual({
      modo: "RETOMAR",
      porque: "a etapa do funil (Aguardando pagamento) mostra pedido concreto",
    });
    expect(modoDoFollowup(linha({ tipo: "lembrete_d1" }))).toEqual({
      modo: "RETOMAR",
      porque: "follow-up de aula marcada",
    });
    expect(modoDoFollowup(linha({ data_agendada_local: "2026-11-05 09:00" }))).toEqual({
      modo: "RETOMAR",
      porque: "o lead tem aula marcada",
    });
  });
});

describe("validarTexto", () => {
  test("remove link proibido e mantém o permitido", () => {
    expect(
      validarTexto({
        texto: "Oi Felipe, olha https://golpe.com/x e www.wakeclub.com.br/carteira.",
      }),
      // Literal do legado: a pontuação colada ao link permitido some junto.
    ).toBe("Oi Felipe, olha e https://www.wakeclub.com.br/carteira");
  });

  test("tira emoji e travessão", () => {
    expect(validarTexto({ texto: "Oi Felipe 🙂 — tudo certo por aí?" })).toBe(
      "Oi Felipe tudo certo por aí?",
    );
  });

  test("corta em 600 sem quebrar palavra; menos de 10 lança", () => {
    const t = validarTexto({ texto: "palavra ".repeat(100) });
    expect(t.length).toBeLessThanOrEqual(600);
    expect(t.endsWith("palavra")).toBe(true);
    expect(() => validarTexto({ texto: "🙂 oi" })).toThrow("curto demais");
    expect(() => validarTexto({})).toThrow();
  });
});

describe("validarPorteiro", () => {
  const ctx = { minimo_local: "2026-11-04 10:30", limite_local: "2026-12-04 10:00" };

  test("enviar ausente é true e descarta reagendamento", () => {
    expect(validarPorteiro({ motivo: "ok", reagendar_para: "2026-11-10 09:00" }, ctx)).toEqual({
      enviar: true,
      motivo: "ok",
      reagendarPara: "",
    });
  });

  test("reagendar é limitado entre mínimo e limite; formato inválido some", () => {
    const cedo = validarPorteiro(
      { enviar: false, motivo: "m", reagendar_para: "2026-11-04 09:00" },
      ctx,
    );
    expect(cedo.reagendarPara).toBe("2026-11-04 10:30");
    const tarde = validarPorteiro(
      { enviar: false, motivo: "m", reagendar_para: "2027-01-01 09:00" },
      ctx,
    );
    expect(tarde.reagendarPara).toBe("2026-12-04 10:00");
    expect(validarPorteiro({ enviar: false, reagendar_para: "amanhã" }, ctx)).toEqual({
      enviar: false,
      motivo: "o porteiro barrou sem dizer o motivo",
      reagendarPara: "",
    });
  });
});

describe("prompts", () => {
  test("porteiro: ficha literal e avaliações no fim do sistema", () => {
    const p = montarPromptPorteiro(linha(), "BLOCO");
    expect(p.sistema.endsWith("BLOCO")).toBe(true);
    expect(p.sistema).not.toContain("{{AVALIACOES}}");
    expect(p.usuario).toContain("LEAD: Felipe\nETIQUETA: Atendimento");
    expect(p.usuario).toContain("FOLLOW-UP EM QUESTAO\n  tipo: reengajar");
    expect(p.usuario).toEndWith("CONVERSA:\n[2026-11-03 09:00] LEAD: quanto custa?");
  });

  test("redator: primeiro nome, modo, links já mandados e toque", () => {
    const p = montarPromptRedator(
      linha({
        textos_anteriores: [
          { em: "2026-11-02 10:00", tipo: "reengajar", texto: "veja wakeclub.com.br/agendar" },
        ],
      }),
      "$& BLOCO",
    );
    expect(p.sistema.endsWith("$& BLOCO")).toBe(true);
    expect(p.usuario).toContain("VOCE E: Isadora\nMODO: REABRIR (");
    expect(p.usuario).toContain("NUMERO DESTE TOQUE: 2");
    expect(p.usuario).toContain(
      "LINKS JA MANDADOS: o link de agendar ja esta com o lead. NAO mande de novo.",
    );
    expect(p.usuario).toEndWith("Escreva a mensagem no modo REABRIR.");
  });
});

describe("formatarAvaliacoes", () => {
  test("vazio", () => {
    expect(formatarAvaliacoes([], [])).toContain("(nenhuma avaliação ainda)");
  });

  test("formata decisões e pares original/editado", () => {
    const b = formatarAvaliacoes(
      [
        {
          decisao: "enviar",
          motivos: ["Ajustei o texto"],
          texto_livre: "tirei o link",
          texto_original: "Oi, segue o link",
          texto_enviado: "Oi, tudo bem?",
        },
        {
          decisao: "enviar",
          motivos: [],
          texto_livre: null,
          texto_original: "Oi Ana, e aí?",
          texto_enviado: "Oi Ana, e aí?",
        },
      ],
      [
        {
          decisao: "recusar",
          motivos: ["Cedo demais", "Tom errado"],
          texto_livre: null,
          texto_original: "Fechou?",
          texto_enviado: null,
        },
      ],
    );
    expect(b).toContain('"Oi, segue o link" → enviar → Ajustei o texto; tirei o link');
    expect(b).toContain('"Oi Ana, e aí?" → enviar → sem motivo');
    expect(b).toContain('"Fechou?" → recusar → Cedo demais, Tom errado');
    expect(b).toContain('"Oi, segue o link" → "Oi, tudo bem?"');
    expect(b).not.toContain('"Oi Ana, e aí?" → "Oi Ana, e aí?"');
  });
});
