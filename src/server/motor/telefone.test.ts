import { describe, expect, test } from "bun:test";

import { ehOptOut, paraE164 } from "./telefone";

describe("telefone em E.164", () => {
  test("celular sem o nono digito ganha o 9", () => {
    expect(paraE164("556399998888")).toBe("+5563999998888");
  });
  test("fixo fica como esta", () => {
    expect(paraE164("556332221111")).toBe("+556332221111");
  });
  test("aceita JID e pontuacao", () => {
    expect(paraE164("5563999998888@s.whatsapp.net".split("@")[0])).toBe("+5563999998888");
    expect(paraE164("+55 (63) 99999-8888")).toBe("+5563999998888");
  });
  test("invalidos viram null", () => {
    expect(paraE164("0639999988")).toBeNull();
    expect(paraE164("1234567")).toBeNull();
    expect(paraE164("")).toBeNull();
  });
});

describe("opt-out", () => {
  test("pedidos curtos para parar", () => {
    expect(ehOptOut("parar")).toBe(true);
    expect(ehOptOut("  Não quero mais  ")).toBe(true);
    expect(ehOptOut("me tira dessa lista")).toBe(true);
  });
  test("frase longa ou sem pedido nao conta", () => {
    expect(ehOptOut("quero parar de errar na prancha, me ajuda a escolher o pacote certo")).toBe(
      false,
    );
    expect(ehOptOut("quanto custa a aula?")).toBe(false);
  });
  test("palavra que so comeca igual nao conta", () => {
    for (const frase of [
      "Parece ótimo, qual o valor?",
      "Sairia por quanto?",
      "Parei pra ver agora",
      "Removeram a aula?",
      "Não quero mais esperar, posso agendar hoje?",
      "Não me mandaram o link",
    ]) {
      expect(ehOptOut(frase)).toBe(false);
    }
  });
  test("pedido inteiro conta", () => {
    for (const frase of [
      "parar",
      "Parar!",
      "pare de mandar",
      "não quero mais",
      "me tira",
      "descadastrar",
      "stop",
      "sair",
      "não me mande mais nada",
      "não quero mais receber",
    ]) {
      expect(ehOptOut(frase)).toBe(true);
    }
  });
});
