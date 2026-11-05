import { describe, expect, test } from "bun:test";

import { etiquetaDaIa, ordemDa, proximaEtapa } from "./etapas";

describe("proximaEtapa", () => {
  test("transições do app", () => {
    expect(proximaEtapa("Novo lead", "cadastro", null)).toBe("Cadastrado");
    expect(proximaEtapa("Aluno com horas", "cadastro", null)).toBeNull();
    expect(proximaEtapa("Aluno sem horas", "compra_paga", 4)).toBe("Aluno com horas");
    expect(proximaEtapa("Encerrado", "compra_paga", 4)).toBeNull();
    expect(proximaEtapa("Aluno com horas", "aula", 0)).toBe("Aluno sem horas");
    expect(proximaEtapa("Aluno com horas", "aula", 2)).toBeNull();
    expect(proximaEtapa("Cadastrado", "aula", 3)).toBe("Aluno com horas");
    expect(proximaEtapa("Cadastrado", "agendamento", null)).toBeNull();
    expect(proximaEtapa("Link enviado", "compra_pendente", null)).toBe("Aguardando pagamento");
    expect(proximaEtapa("Aluno com horas", "compra_pendente", null)).toBeNull();
  });
  test("ordemDa", () => {
    expect(ordemDa("Novo lead")).toBe(1);
    expect(ordemDa("Encerrado")).toBe(8);
    expect(ordemDa("xyz")).toBe(99);
  });
});

describe("etiquetaDaIa", () => {
  test("legados, rebaixamento e etapas do app", () => {
    expect(etiquetaDaIa("Atendimento", "Novo lead")).toBe("Em atendimento");
    expect(etiquetaDaIa("Novo Lead", "Novo lead")).toBe("Novo lead");
    expect(etiquetaDaIa("Novo lead", "Cadastrado")).toBe("Cadastrado");
    expect(etiquetaDaIa("Negociacao encerrada", "Aluno com horas")).toBe("Encerrado");
    expect(etiquetaDaIa("Negociação encerrada", "Novo lead")).toBe("Encerrado");
    expect(etiquetaDaIa("Aguardando pagamento", "Link enviado")).toBe("Link enviado");
  });
});
