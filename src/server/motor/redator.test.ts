import { describe, expect, test } from "bun:test";

import {
  formatarRevisoes,
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
    expect(modoDoFollowup(linha({ etiqueta: "Cadastrado", tipo: "parado" })).modo).toBe("RETOMAR");
    expect(modoDoFollowup(linha({ etiqueta: "Aluno sem horas", tipo: "parado" })).modo).toBe(
      "RETOMAR",
    );
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

  test("remove domínio nu proibido e completa o permitido", () => {
    const v = (texto: string) => validarTexto({ texto });
    expect(v("Oi Felipe, veja wakeclub.com.br/promo agora")).toBe("Oi Felipe, veja agora");
    expect(v("Oi Felipe, clique bit.ly/x.")).toBe("Oi Felipe, clique .");
    expect(v("Oi Felipe, paga no pix.com ok")).toBe("Oi Felipe, paga no ok");
    expect(v("Agende em wakeclub.com.br/agendar")).toBe(
      "Agende em https://www.wakeclub.com.br/agendar",
    );
    expect(v("Valores em WAKECLUB.COM.BR/CARTEIRA")).toBe(
      "Valores em https://www.wakeclub.com.br/carteira",
    );
    expect(v("Promo em Wakeclub.com.br/PROMO hoje")).toBe("Promo em hoje");
    expect(v("Oi Felipe, veja WAKE.COM hoje")).toBe("Oi Felipe, veja hoje");
    expect(v("Oi Felipe, veja wake.com/x hoje")).toBe("Oi Felipe, veja hoje");
    expect(v("Oi Felipe, veja Wake.Com/x hoje")).toBe("Oi Felipe, veja hoje");
  });

  test("domínio nu: falsos positivos ficam", () => {
    const t = "Fica R$ 1.500, tudo.Bem? O pix.combo vale. Se fica.Me avisa.";
    expect(validarTexto({ texto: t })).toBe(t);
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
    for (const impossivel of ["2026-02-30 10:00", "2026-11-10 25:61"]) {
      expect(
        validarPorteiro({ enviar: false, motivo: "m", reagendar_para: impossivel }, ctx)
          .reagendarPara,
      ).toBe("");
    }
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

  test("objetivo do follow-up no lugar do motivo de quem agendou", () => {
    const d = linha({ tipo: "parado", motivo: "concluir o cadastro" });
    const r = montarPromptRedator(d, "B").usuario;
    expect(r).toContain("OBJETIVO DESTE FOLLOW-UP: concluir o cadastro");
    expect(r).not.toContain("por que foi agendado");
    const p = montarPromptPorteiro(d, "B").usuario;
    expect(p).toContain("OBJETIVO DESTE FOLLOW-UP: concluir o cadastro");
    expect(p).not.toContain("motivo de quem agendou");
  });
});

describe("formatarRevisoes", () => {
  test("vazio", () => {
    expect(formatarRevisoes([])).toBe(
      "REVISOES DO ADMIN SOBRE DECISOES DA EQUIPE (calibre-se por elas)\n(nenhuma revisão ainda)",
    );
  });

  test("uma linha por revisão: texto da IA, decisão da atendente e avaliação do admin", () => {
    const b = formatarRevisoes([
      {
        texto_original: "Oi, segue o link",
        texto_enviado: "Oi, tudo bem?",
        decisao: "enviar",
        motivos: ["Ajustei o texto"],
        texto_livre: "tirei o link",
        concorda: true,
        observacao: "boa edição",
      },
      {
        texto_original: "Fechou?",
        texto_enviado: null,
        decisao: "recusar",
        motivos: [],
        texto_livre: null,
        concorda: false,
        observacao: null,
      },
    ]);
    expect(b).toBe(
      "REVISOES DO ADMIN SOBRE DECISOES DA EQUIPE (calibre-se por elas)\n" +
        '"Oi, segue o link" → atendente: enviar (Ajustei o texto; tirei o link) → admin: Concordo: boa edição\n' +
        '"Fechou?" → atendente: recusar (sem motivo) → admin: Discordo: sem observação',
    );
  });
});
